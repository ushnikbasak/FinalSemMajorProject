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

  // Accordion Toggle State for Lists
  const [showPending, setShowPending] = useState(true); // Default open
  const [showGraded, setShowGraded] = useState(false);  // Default closed to save space

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
          // SMART PRE-FILTERING
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
    <div className="form-box" style={{ maxWidth: "1100px", margin: "40px auto 20px auto" }}>
      
      {/* HEADER SECTION */}
      <div style={{ textAlign: "center", marginBottom: "35px" }}>
        <h3>Professor Panel</h3>
        
        <div style={{ display: "inline-block", backgroundColor: "#f8f9fa", padding: "10px 20px", borderRadius: "8px", border: "1px solid #dee2e6", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
          <span style={{ fontSize: "1.1em", color: "#6c757d" }}>
            Connected Wallet: <strong style={{ color: "#007bff", wordBreak: "break-all", marginLeft: "5px", letterSpacing: "0.5px" }}>{account || "Not connected"}</strong>
          </span>
        </div>
      </div>
      
      {/* TOP SECTION: GRADING CONSOLE */}
      <div style={{ backgroundColor: "#ffffff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "25px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)", marginBottom: "30px" }}>
        
        {/* Sleek Segmented Control for Mode Toggle */}
        <div style={{ display: "flex", backgroundColor: "#f1f3f5", borderRadius: "8px", padding: "5px", marginBottom: "25px", maxWidth: "600px", margin: "0 auto 25px auto" }}>
          <button 
            onClick={() => setInputMode("single")}
            style={{ flex: 1, backgroundColor: inputMode === "single" ? "#ffffff" : "transparent", color: inputMode === "single" ? "#007bff" : "#6c757d", border: "none", borderRadius: "5px", padding: "10px", fontWeight: "bold", cursor: "pointer", boxShadow: inputMode === "single" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s ease-in-out" }}
          >
            ✏️ Manual Entry
          </button>
          <button 
            onClick={() => setInputMode("batch")}
            style={{ flex: 1, backgroundColor: inputMode === "batch" ? "#ffffff" : "transparent", color: inputMode === "batch" ? "#28a745" : "#6c757d", border: "none", borderRadius: "5px", padding: "10px", fontWeight: "bold", cursor: "pointer", boxShadow: inputMode === "batch" ? "0 2px 4px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s ease-in-out" }}
          >
            📁 Batch CSV Upload
          </button>
        </div>

        {/* SINGLE MODE */}
        {inputMode === "single" && (
          <div style={{ maxWidth: "500px", margin: "0 auto", textAlign: "center" }}>
            <h4 style={{ marginTop: 0, color: "#333" }}>Grade Individual Student</h4>
            <input type="number" placeholder="Enter Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ width: "100%", padding: "12px", marginBottom: "15px", border: "1px solid #ccc", borderRadius: "5px", boxSizing: "border-box" }} />

            {studentId && dropdownSubjects.length > 0 && (
              <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} style={{ width: "100%", padding: "12px", marginBottom: "15px", border: "1px solid #ccc", borderRadius: "5px", backgroundColor: "#fff" }}>
                {dropdownSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            )}

            {studentId && allStudentsData.some(s => s.studentId.toString() === studentId) && dropdownSubjects.length === 0 && (
              <div style={{ backgroundColor: "#f8d7da", color: "#721c24", padding: "10px", borderRadius: "5px", marginBottom: "15px", fontSize: "0.9em" }}>
                ⚠️ Student is not enrolled in your subjects.
              </div>
            )}

            {gradedRecordInfo ? (
              <div style={{ backgroundColor: "#e8f5e9", padding: "15px", borderRadius: "5px", marginBottom: "15px", border: "1px solid #c8e6c9" }}>
                <p style={{ color: "#2e7d32", margin: "0 0 5px 0" }}><strong>✅ Already Graded for {selectedSubject}</strong></p>
                <p style={{ margin: "0", fontSize: "1.2em" }}><strong>Marks:</strong> {gradedRecordInfo.marks}</p>
              </div>
            ) : (
              dropdownSubjects.length > 0 && (
                <div style={{ textAlign: "left" }}>
                  <input type="number" placeholder="Marks (0 - 100)" value={marks} onChange={(e) => setMarks(e.target.value)} style={{ width: "100%", padding: "12px", border: isMarksInvalid ? "1px solid red" : "1px solid #ccc", borderRadius: "5px", boxSizing: "border-box" }} />
                  {isMarksInvalid && <p style={{ color: "red", fontSize: "0.85em", margin: "5px 0 0 0" }}>⚠️ Marks must be between 0 and 100.</p>}
                </div>
              )
            )}

            <button 
              onClick={handleUpload} 
              disabled={isUploadDisabled} 
              style={{ width: "100%", padding: "12px", backgroundColor: isUploadDisabled ? "#e9ecef" : "#007bff", color: isUploadDisabled ? "#6c757d" : "white", cursor: isUploadDisabled ? "not-allowed" : "pointer", marginTop: "15px", border: "none", borderRadius: "5px", fontWeight: "bold", fontSize: "1em" }}
            >
              {gradedRecordInfo ? "Record Locked" : "Upload Marksheet"}
            </button>
          </div>
        )}

        {/* BATCH MODE */}
        {inputMode === "batch" && (
          <div style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#f8f9fa", padding: "20px", border: "2px dashed #ced4da", borderRadius: "8px" }}>
            <h4 style={{ marginTop: 0, textAlign: "center", color: "#333" }}>Upload Class Roster Grades</h4>
            
            <div style={{ marginBottom: "15px", textAlign: "left" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#495057", fontSize: "0.9em" }}>1. Select Subject</label>
              <select value={batchSubject} onChange={(e) => setBatchSubject(e.target.value)} style={{ width: "100%", padding: "12px", border: "1px solid #ccc", borderRadius: "5px", backgroundColor: "#fff" }}>
                {authorizedSubjects.length === 0 ? <option value="">No subjects assigned</option> : authorizedSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: "20px", textAlign: "left" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#495057", fontSize: "0.9em" }}>2. Select CSV File (Format: ID, Marks)</label>
              <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files[0])} style={{ width: "100%", padding: "10px", backgroundColor: "#fff", border: "1px solid #ccc", borderRadius: "5px" }} />
            </div>

            <button 
              onClick={handleBatchUpload} 
              disabled={!batchSubject || !csvFile || !isProfessor} 
              style={{ width: "100%", padding: "12px", backgroundColor: (!batchSubject || !csvFile) ? "#e9ecef" : "#28a745", color: (!batchSubject || !csvFile) ? "#6c757d" : "white", cursor: (!batchSubject || !csvFile) ? "not-allowed" : "pointer", border: "none", borderRadius: "5px", fontWeight: "bold", fontSize: "1em" }}
            >
              Run Batch Upload
            </button>
            <p style={{ fontSize: "0.85em", color: "#6c757d", marginTop: "15px", textAlign: "center", marginBottom: 0 }}>
              <em>Note: System automatically skips students already graded or not enrolled.</em>
            </p>
          </div>
        )}

        {!isProfessor && <p style={{ color: "#dc3545", textAlign: "center", marginTop: "15px", fontWeight: "bold" }}>Only a registered professor can upload marks.</p>}
        {status && <p className="status-message" style={{ textAlign: "center", marginTop: "15px", fontWeight: "bold" }}>{status}</p>}
      </div>

      {/* BOTTOM SECTION: TWO-COLUMN ROSTER GRID */}
      {authorizedSubjects.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
          
          {/* LEFT SIDEBAR: Subject Tabs */}
          <div style={{ flex: "1", minWidth: "250px", backgroundColor: "#ffffff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
            <h4 style={{ marginTop: 0, borderBottom: "2px solid #f1f3f5", paddingBottom: "10px", color: "#333" }}>Teaching Load</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {authorizedSubjects.map(sub => {
                const { graded, total } = getSubjectLists(sub);
                const isComplete = graded.length === total && total > 0;
                return (
                  <button
                    key={sub}
                    onClick={() => {
                      setActiveSubjectTab(sub);
                      setBatchSubject(sub);
                    }}
                    style={{
                      backgroundColor: activeSubjectTab === sub ? "#007bff" : "#f8f9fa",
                      color: activeSubjectTab === sub ? "white" : "#495057",
                      border: activeSubjectTab === sub ? "none" : "1px solid #dee2e6",
                      padding: "12px 15px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      transition: "all 0.2s"
                    }}
                  >
                    <strong style={{ fontSize: "1.05em" }}>{sub}</strong>
                    <span style={{ fontSize: "0.8em", backgroundColor: activeSubjectTab === sub ? "rgba(255,255,255,0.2)" : (isComplete ? "#d4edda" : "#f8d7da"), color: activeSubjectTab === sub ? "white" : (isComplete ? "#155724" : "#721c24"), padding: "3px 8px", borderRadius: "12px", fontWeight: "bold" }}>
                      {graded.length}/{total} Graded
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT PANEL: Class Roster Tables */}
          <div style={{ flex: "2", minWidth: "350px" }}>
            {activeSubjectTab ? (
              <div style={{ backgroundColor: "#ffffff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "20px", boxShadow: "0 4px 6px rgba(0,0,0,0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #f1f3f5", paddingBottom: "10px", marginBottom: "20px" }}>
                  <h4 style={{ margin: 0, color: "#007bff" }}>Class Roster: {activeSubjectTab}</h4>
                  <span style={{ fontSize: "0.85em", color: "#6c757d" }}>Total Enrolled: {activeLists.total}</span>
                </div>
                
                {/* COLLAPSIBLE PENDING LIST */}
                <div style={{ marginBottom: "20px" }}>
                  <button 
                    onClick={() => setShowPending(!showPending)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 15px", backgroundColor: showPending ? "#f8d7da" : "#fdfdfe", color: "#dc3545", border: "1px solid #f5c6cb", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s" }}
                  >
                    <span>⏳ Pending Grading ({activeLists.pending.length})</span>
                    <span>{showPending ? "▲" : "▼"}</span>
                  </button>

                  {showPending && (
                    <div style={{ border: "1px solid #f5c6cb", borderTop: "none", borderBottomLeftRadius: "5px", borderBottomRightRadius: "5px", padding: "15px", backgroundColor: "#fff" }}>
                      <table className="uploaded-students-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ backgroundColor: "#f8f9fa" }}>
                            <th style={{ padding: "10px", borderBottom: "2px solid #dee2e6", textAlign: "left" }}>Student ID</th>
                            <th style={{ padding: "10px", borderBottom: "2px solid #dee2e6", textAlign: "right" }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeLists.pending.length > 0 ? (
                            activeLists.pending.map((s, index) => (
                              <tr key={index} style={{ borderBottom: "1px solid #e9ecef" }}>
                                <td style={{ padding: "10px", fontWeight: "500" }}>{s.studentId.toString()}</td>
                                <td style={{ padding: "10px", textAlign: "right" }}>
                                  <button 
                                    onClick={() => {
                                      setInputMode("single");
                                      setStudentId(s.studentId.toString());
                                      setSelectedSubject(activeSubjectTab);
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    style={{ padding: "6px 12px", backgroundColor: "#ffc107", color: "#212529", border: "none", borderRadius: "4px", fontSize: "0.85em", fontWeight: "bold", cursor: "pointer" }}
                                  >
                                    Grade Manually
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr><td colSpan="2" style={{ padding: "15px", textAlign: "center", color: "#6c757d" }}>All students graded for {activeSubjectTab} </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* COLLAPSIBLE GRADED LIST */}
                <div>
                  <button 
                    onClick={() => setShowGraded(!showGraded)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 15px", backgroundColor: showGraded ? "#d4edda" : "#fdfdfe", color: "#28a745", border: "1px solid #c3e6cb", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s" }}
                  >
                    <span>✅ Successfully Graded ({activeLists.graded.length})</span>
                    <span>{showGraded ? "▲" : "▼"}</span>
                  </button>

                  {showGraded && (
                    <div style={{ border: "1px solid #c3e6cb", borderTop: "none", borderBottomLeftRadius: "5px", borderBottomRightRadius: "5px", padding: "15px", backgroundColor: "#fff" }}>
                      <table className="uploaded-students-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ backgroundColor: "#f8f9fa" }}>
                            <th style={{ padding: "10px", borderBottom: "2px solid #dee2e6", textAlign: "left" }}>Student ID</th>
                            <th style={{ padding: "10px", borderBottom: "2px solid #dee2e6", textAlign: "center" }}>Marks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeLists.graded.length > 0 ? (
                            activeLists.graded.map((s, index) => {
                              const result = s.results.find(r => r.subjectId === activeSubjectTab);
                              return (
                                <tr key={index} style={{ borderBottom: "1px solid #e9ecef" }}>
                                  <td style={{ padding: "10px", fontWeight: "500" }}>{s.studentId.toString()}</td>
                                  <td style={{ padding: "10px", textAlign: "center", fontWeight: "bold", color: "#28a745" }}>{Number(result.marks) - 1}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr><td colSpan="2" style={{ padding: "15px", textAlign: "center", color: "#6c757d" }}>No grades uploaded yet.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div style={{ backgroundColor: "#f8f9fa", border: "1px dashed #ced4da", borderRadius: "10px", padding: "40px 20px", textAlign: "center", color: "#6c757d" }}>
                Select a subject from the left to view the roster.
              </div>
            )}
          </div>

        </div>
      ) : (
        <div style={{ backgroundColor: "#fff3cd", color: "#856404", padding: "20px", borderRadius: "8px", border: "1px solid #ffeeba", textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: "bold" }}>You are not currently assigned to grade any subjects. Please contact the Dean.</p>
        </div>
      )}
    </div>
  );
};

export default Professor;