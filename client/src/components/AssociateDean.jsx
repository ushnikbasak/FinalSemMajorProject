import React, { useState, useContext, useEffect } from "react";
import { Web3Context } from "../contexts/Web3Context";
import Web3 from "web3";

const AssociateDean = () => {
  const { contract, account } = useContext(Web3Context);
  
  // Roles & Global Status
  const [isAssociateDean, setIsAssociateDean] = useState(false);
  const [status, setStatus] = useState("");
  
  // Top-Level Navigation
  const [activeMainTab, setActiveMainTab] = useState("records"); // "records" or "requests"

  // Manual Validation HUD State
  const [studentId, setStudentId] = useState("");
  const [marksheet, setMarksheet] = useState(null);
  const [nonce, setNonce] = useState(null);

  // Verification Requests State
  const [pendingVerificationRequests, setPendingVerificationRequests] = useState([]);

  // Lists State
  const [validatedStudents, setValidatedStudents] = useState([]);
  const [readyStudents, setReadyStudents] = useState([]);
  const [incompleteStudents, setIncompleteStudents] = useState([]);
  const [activeAccordion, setActiveAccordion] = useState("ready"); // "incomplete", "ready", "validated", or null

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  // 1. Check Role & Auto-Fetch
  useEffect(() => {
    const checkRole = async () => {
      if (!contract || !account) return setIsAssociateDean(false);
      
      try {
        const result = await contract.methods.isAssociateDean(account).call();
        setIsAssociateDean(result);
        if (result) {
          fetchVerificationRequests();
          fetchAllStudents();
        }
      } catch (err) {
        console.error("Role check failed:", err);
        setIsAssociateDean(false);
      }
    };
    checkRole();
  }, [contract, account]);

  // 2. Fetch External Verification Requests
  const fetchVerificationRequests = async () => {
    if (!contract || !account) return;
    try {
      const count = await contract.methods.getRequestsCount().call();
      const requests = [];
      for (let i = 0; i < count; i++) {
        const req = await contract.methods.allRequests(i).call();
        // Status 1 == Pending
        if (Number(req.status) === 1) {
          requests.push({
            index: i,
            companyName: req.companyName,
            studentId: req.studentId.toString(),
            verifier: req.verifier
          });
        }
      }
      setPendingVerificationRequests(requests.reverse());
    } catch (err) {
      console.error("Error fetching verification requests:", err);
    }
  };

  const handleProcessRequest = async (reqIdx) => {
    try {
      setStatus(`Processing request #${reqIdx}... Please confirm transaction.`);
      await contract.methods.processRequest(reqIdx).send({ from: account });
      setStatus("✅ Request successfully processed and forwarded to Dean.");
      fetchVerificationRequests();
    } catch (err) {
      console.error("Error processing request:", err);
      setStatus("❌ Failed to process request.");
    }
  };

  const handleRejectRequest = async (reqIdx) => {
    const confirm = window.confirm("Are you sure you want to REJECT this verification request?");
    if (!confirm) return;
    try {
      setStatus(`Rejecting request #${reqIdx}...`);
      await contract.methods.rejectRequest(reqIdx).send({ from: account });
      setStatus("✅ Request rejected.");
      fetchVerificationRequests();
    } catch (err) {
      console.error("Error rejecting request:", err);
      setStatus("❌ Failed to reject request.");
    }
  };

  // 3. Fetch Single Marksheet for HUD
  useEffect(() => {
    const fetchMarksheet = async () => {
      if (!studentId || !contract || !account) {
        setMarksheet(null);
        setNonce(null);
        return;
      }
      try {
        const result = await contract.methods.viewMarksheet(studentId).call({ from: account });
        if (result.studentWallet === zeroAddress) {
          setMarksheet(null);
          setStatus("Marksheet not found for this Student ID.");
        } else {
          setMarksheet(result);
          setNonce(null); // Reset nonce when a new student is loaded
          
          // Determine Readiness
          const isComplete = result.results.every(r => Number(r.marks) > 0);
          if (result.isValidated) {
            setStatus("✅ Marksheet loaded. It is already validated.");
          } else if (!isComplete) {
            setStatus("⚠️ Marksheet loaded, but incomplete. Missing marks.");
          } else {
            setStatus("⏳ Marksheet complete. Calculate nonce to validate.");
          }
        }
      } catch (err) {
        console.error("Error fetching marksheet:", err);
        setStatus("Error fetching marksheet.");
      }
    };
    fetchMarksheet();
  }, [studentId, contract, account]);

  // 4. Fetch & Categorize All Students for Lists
  const fetchAllStudents = async () => {
    if (!contract || !account) return;
    try {
      const length = await contract.methods.studentListLength().call();
      const validated = [];
      const ready = [];
      const incomplete = [];
      const seen = new Set();

      for (let i = 0; i < length; i++) {
        const sId = await contract.methods.studentList(i).call();
        if (seen.has(sId)) continue;
        seen.add(sId);

        try {
          const m = await contract.methods.viewMarksheet(sId).call({ from: account });
          if (m.studentWallet === zeroAddress) continue; // Skip empty records

          // Check if any subject has 0 marks
          const missingSubjects = m.results.filter(r => Number(r.marks) === 0).map(r => r.subjectId);
          const isComplete = missingSubjects.length === 0 && m.results.length > 0;

          if (m.isValidated) {
            validated.push(m.studentId.toString());
          } else if (isComplete) {
            ready.push(m.studentId.toString());
          } else {
            incomplete.push({ id: m.studentId.toString(), missing: missingSubjects });
          }
        } catch (innerErr) {
          console.warn(`Skipping student ${sId}`);
        }
      }
      setValidatedStudents(validated);
      setReadyStudents(ready);
      setIncompleteStudents(incomplete);
    } catch (err) {
      console.error("Error loading student data:", err);
    }
  };

  // 5. PoW Calculation
  const calculateNonce = async () => {
    if (!marksheet) return;
    setStatus("Calculating nonce...");
    let currentNonce = 0;
    const MAX_ITERATIONS = 500000;

    // Fast asynchronous loop to prevent UI freezing
    const mine = () => {
      for (let i = 0; i < 5000; i++) {
        // Matches Solidity: keccak256(abi.encodePacked(_nonce, marksheet.studentId, "Validation"))
        const verificationHash = Web3.utils.soliditySha3(
          { type: 'uint256', value: currentNonce },
          { type: 'uint256', value: marksheet.studentId },
          { type: 'string', value: "Validation" }
        );

        if (verificationHash && verificationHash.startsWith("0x00")) {
          setNonce(currentNonce);
          setStatus(`✅ Nonce found: ${currentNonce}. You can now validate.`);
          return;
        }
        currentNonce++;
      }
      
      if (currentNonce < MAX_ITERATIONS) {
        setTimeout(mine, 0); // Yield to main thread, then continue
      } else {
        setStatus("Could not find valid nonce within iterations limit.");
      }
    };
    
    setTimeout(mine, 0);
  };

  // 6. Validation Upload
  const handleValidate = async () => {
    if (!isAssociateDean) return setStatus("❌ Unauthorized.");
    if (!marksheet || nonce === null) return setStatus("❌ No nonce found.");

    try {
      setStatus("Awaiting confirmation in wallet...");
      await contract.methods.validate(studentId, nonce).send({ from: account });
      setStatus("✅ Marksheet validated successfully!");
      setNonce(null);
      
      // Refresh Data
      const updated = await contract.methods.viewMarksheet(studentId).call({ from: account });
      setMarksheet(updated);
      fetchAllStudents();
    } catch (err) {
      console.error("Validation failed:", err);
      setStatus("❌ Validation failed. Check console for details.");
    }
  };

  // UI Helpers
  const toggleAccordion = (tabName) => {
    setActiveAccordion(activeAccordion === tabName ? null : tabName);
  };

  return (
    <div className="form-box">
      <h3>Associate Dean Panel</h3>
      <p>Connected as: {account || "Not connected"}</p>

      {/* TOP LEVEL TABS */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button 
          onClick={() => setActiveMainTab("records")}
          style={{ flex: 1, backgroundColor: activeMainTab === "records" ? "#007bff" : "#6c757d", color: "white", padding: "12px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
        >
          🎓 Manage Student Records
        </button>
        <button 
          onClick={() => setActiveMainTab("requests")}
          style={{ flex: 1, backgroundColor: activeMainTab === "requests" ? "#28a745" : "#6c757d", color: "white", padding: "12px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
        >
          🏢 Company Verifications ({pendingVerificationRequests.length})
        </button>
      </div>

      {/* ========================================================= */}
      {/* SECTION 1: VERIFICATION REQUESTS */}
      {/* ========================================================= */}
      {activeMainTab === "requests" && (
        <div className="upload-form">
          <h4 style={{ marginTop: 0, color: "#28a745" }}>External Verification Requests</h4>
          <table className="uploaded-students-table">
            <thead>
              <tr>
                <th>Req #</th>
                <th>Company</th>
                <th>Student ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingVerificationRequests.length > 0 ? (
                pendingVerificationRequests.map((req) => (
                  <tr key={req.index}>
                    <td>{req.index}</td>
                    <td><strong>{req.companyName}</strong></td>
                    <td>{req.studentId}</td>
                    <td>
                      <button onClick={() => handleProcessRequest(req.index)} style={{ backgroundColor: "#28a745", color: "white", padding: "5px 10px", border: "none", borderRadius: "3px", marginRight: "5px" }}>Process</button>
                      <button onClick={() => handleRejectRequest(req.index)} style={{ backgroundColor: "#dc3545", color: "white", padding: "5px 10px", border: "none", borderRadius: "3px" }}>Reject</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="4">No pending requests from external verifiers.</td></tr>
              )}
            </tbody>
          </table>
          <p className="status-message">{status}</p>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 2: STUDENT RECORDS & VALIDATION */}
      {/* ========================================================= */}
      {activeMainTab === "records" && (
        <>
          {/* HUD: Manual Input & Details */}
          <div className="upload-form">
            <h4 style={{ marginTop: 0 }}>Audit Marksheet</h4>
            <input
              type="number"
              placeholder="Enter Student ID"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />

            {marksheet && marksheet.studentWallet !== zeroAddress && (
              <div className="marksheet-details" style={{ textAlign: "left", padding: "15px", backgroundColor: "#fff", border: "1px solid #ccc", marginTop: "10px", borderRadius: "5px" }}>
                <p><strong>Student ID:</strong> {marksheet.studentId.toString()}</p>
                <p><strong>Status:</strong> {marksheet.isValidated ? "✅ Validated" : "⏳ Pending Audit"}</p>
                
                <hr style={{ margin: "10px 0" }}/>
                <p style={{ margin: "0 0 5px 0" }}><strong>Subject Marks:</strong></p>
                
                <ul style={{ listStyleType: "none", paddingLeft: "0", margin: "0" }}>
                  {marksheet.results.map((res, idx) => (
                    <li key={idx} style={{ marginBottom: "5px", padding: "5px", backgroundColor: Number(res.marks) > 0 ? "#e8f5e9" : "#ffebee", borderRadius: "4px" }}>
                      <strong>{res.subjectId}:</strong> {Number(res.marks) === 0 ? <span style={{color: "red"}}>Missing</span> : Number(res.marks) - 1} 
                    </li>
                  ))}
                </ul>
                
                {marksheet.isValidated && (
                  <div style={{ marginTop: "10px", fontSize: "0.85em", color: "#555" }}>
                    <p><strong>Validated By:</strong> {marksheet.validatedBy}</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {marksheet && !marksheet.isValidated && marksheet.results.every(r => Number(r.marks) > 0) && (
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button 
                  onClick={calculateNonce} 
                  disabled={!isAssociateDean || nonce !== null}
                  style={{ flex: 1 }}
                >
                  {nonce !== null ? `Nonce: ${nonce}` : "Calculate Nonce (PoW)"}
                </button>
                <button 
                  onClick={handleValidate} 
                  disabled={nonce === null || !isAssociateDean}
                  style={{ flex: 1, backgroundColor: nonce !== null ? "#28a745" : "" }}
                >
                  Validate & Mine
                </button>
              </div>
            )}

            {!isAssociateDean && <p style={{ color: "red" }}>Only an associate dean can validate marksheets.</p>}
            <p className="status-message">{status}</p>
          </div>

          <hr />

          {/* ACCORDION LISTS */}
          <div className="lists-container">
            
            {/* Ready List */}
            <div className="professor-list-box" style={{ marginBottom: "10px" }}>
              <button 
                onClick={() => toggleAccordion("ready")} 
                style={{ backgroundColor: activeAccordion === "ready" ? "#007bff" : "#f1f1f1", color: activeAccordion === "ready" ? "white" : "black", padding: "10px", border: "1px solid #ccc", width: "100%", textAlign: "left", cursor: "pointer", fontWeight: "bold" }}
              >
                ⏳ Ready for Validation ({readyStudents.length}) {activeAccordion === "ready" ? "▲" : "▼"}
              </button>
              
              {activeAccordion === "ready" && (
                <table className="uploaded-students-table" style={{ width: "100%", marginTop: "5px" }}>
                  <thead><tr><th>Student ID</th><th>Action</th></tr></thead>
                  <tbody>
                    {readyStudents.length > 0 ? (
                      readyStudents.map((id, index) => (
                        <tr key={index}>
                          <td>{id}</td>
                          <td>
                            <button onClick={() => { setStudentId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Audit & Validate</button>
                          </td>
                        </tr>
                      ))
                    ) : (<tr><td colSpan="2">No students currently ready for validation.</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>

            {/* Incomplete List */}
            <div className="professor-list-box" style={{ marginBottom: "10px" }}>
              <button 
                onClick={() => toggleAccordion("incomplete")} 
                style={{ backgroundColor: activeAccordion === "incomplete" ? "#dc3545" : "#f1f1f1", color: activeAccordion === "incomplete" ? "white" : "black", padding: "10px", border: "1px solid #ccc", width: "100%", textAlign: "left", cursor: "pointer", fontWeight: "bold" }}
              >
                ❌ Incomplete Students ({incompleteStudents.length}) {activeAccordion === "incomplete" ? "▲" : "▼"}
              </button>

              {activeAccordion === "incomplete" && (
                <table className="uploaded-students-table" style={{ width: "100%", marginTop: "5px" }}>
                  <thead><tr><th>Student ID</th><th>Missing Subjects</th></tr></thead>
                  <tbody>
                    {incompleteStudents.length > 0 ? (
                      incompleteStudents.map((s, index) => (
                        <tr key={index}>
                          <td>{s.id}</td>
                          <td style={{ color: "#dc3545", fontSize: "0.9em" }}>
                            {s.missing.join(", ")}
                          </td>
                        </tr>
                      ))
                    ) : (<tr><td colSpan="2">No incomplete students.</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>

            {/* Validated List */}
            <div className="professor-list-box" style={{ marginBottom: "10px" }}>
              <button 
                onClick={() => toggleAccordion("validated")} 
                style={{ backgroundColor: activeAccordion === "validated" ? "#28a745" : "#f1f1f1", color: activeAccordion === "validated" ? "white" : "black", padding: "10px", border: "1px solid #ccc", width: "100%", textAlign: "left", cursor: "pointer", fontWeight: "bold" }}
              >
                ✅ History: Validated by Me ({validatedStudents.length}) {activeAccordion === "validated" ? "▲" : "▼"}
              </button>

              {activeAccordion === "validated" && (
                <table className="uploaded-students-table" style={{ width: "100%", marginTop: "5px" }}>
                  <thead><tr><th>Student ID</th><th>Action</th></tr></thead>
                  <tbody>
                    {validatedStudents.length > 0 ? (
                      validatedStudents.map((id, index) => (
                        <tr key={index}>
                          <td>{id}</td>
                          <td>
                            <button onClick={() => { setStudentId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>View Details</button>
                          </td>
                        </tr>
                      ))
                    ) : (<tr><td colSpan="2">You have not validated any students yet.</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default AssociateDean;