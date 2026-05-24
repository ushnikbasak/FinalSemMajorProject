import React, { useState, useContext, useEffect } from "react";
import Papa from "papaparse";
import { Web3Context } from "../contexts/Web3Context";

const Dean = () => {
  const { contract, account, web3 } = useContext(Web3Context);

  const [studentId, setStudentId] = useState("");
  const [marksheet, setMarksheet] = useState(null);
  const [status, setStatus] = useState("");
  const [isDean, setIsDean] = useState(false);

  // CSV Parsing State (Updated for 2D Subjects Array)
  const [parsedIds, setParsedIds] = useState([]);
  const [parsedWallets, setParsedWallets] = useState([]);
  const [parsedSubjects, setParsedSubjects] = useState([]);
  const [batchStatus, setBatchStatus] = useState("");

  // Role Management State
  const [newProfAddress, setNewProfAddress] = useState("");
  const [newAssocDeanAddress, setNewAssocDeanAddress] = useState("");
  const [roleChangeStatus, setRoleChangeStatus] = useState("");

  // Catalog & Assignment State
  const [newSubjectId, setNewSubjectId] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("");
  const [assignProfAddress, setAssignProfAddress] = useState("");
  const [assignSubjectId, setAssignSubjectId] = useState("");
  const [assignStatus, setAssignStatus] = useState("");

  const [finalizedStudents, setFinalizedStudents] = useState([]);
  const [notFinalizedStudents, setNotFinalizedStudents] = useState([]);
  const [processedRequests, setProcessedRequests] = useState([]);

  const [showFinalized, setShowFinalized] = useState(false);
  const [showNotFinalized, setShowNotFinalized] = useState(false);
  const [showRequests, setShowRequests] = useState(true); // Default to true so Dean sees pending actions

  const [activeTab, setActiveTab] = useState("register"); // Default tab

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  // Check dean role
  useEffect(() => {
    const checkRole = async () => {
      if (!contract || !account) return setIsDean(false);
      try {
        const deanAddress = await contract.methods.dean().call();
        const isDeanAccount = deanAddress.toLowerCase() === account.toLowerCase();
        setIsDean(isDeanAccount);
        if (isDeanAccount) {
          fetchVerificationRequests();
        }
      } catch (err) {
        console.error("Role check failed:", err);
        setIsDean(false);
      }
    };
    checkRole();
  }, [contract, account]);

  // Fetch marksheet
  useEffect(() => {
    const fetchMarksheet = async () => {
      if (!studentId || !contract || !account) return;

      try {
        const result = await contract.methods.viewMarksheet(studentId).call({ from: account });

        // A student exists if they have a wallet address bound to them
        if (result.studentWallet === zeroAddress) {
          setMarksheet(null);
          setStatus("Marksheet not found for this Student ID.");
        } else {
          setMarksheet(result);
          setStatus(
            result.isUploaded
              ? "Marksheet already finalized."
              : "Marksheet ready for final approval."
          );
        }
      } catch (err) {
        console.error("Error fetching marksheet:", err);
        setStatus("❌ Error fetching marksheet. Check console for details.");
      }
    };

    fetchMarksheet();
  }, [studentId, contract, account]);

  // Fetch Processed Verification Requests 
  const fetchVerificationRequests = async () => {
    if (!contract || !account) return;

    try {
      const count = await contract.methods.getRequestsCount().call();
      const requests = [];

      for (let i = 0; i < count; i++) {
        const req = await contract.methods.allRequests(i).call();

        // Filter: Dean only sees "Processed" (Status 2) requests
        if (Number(req.status) === 2) {
          requests.push({
            index: i,
            companyName: req.companyName,
            studentId: req.studentId.toString(),
            verifier: req.verifier
          });
        }
      }
      setProcessedRequests(requests.reverse());
    } catch (err) {
      console.error("Error fetching verification requests:", err);
    }
  };

  // Authorize Request 
  const handleAuthorizeRequest = async (reqIdx) => {
    if (!isDean) return;
    try {
      setStatus(`Authorizing request #${reqIdx}... Please confirm transaction.`);
      await contract.methods.authorizeRequest(reqIdx).send({ from: account });
      setStatus("✅ Request officially authorized. Data unlocked for verifier.");
      fetchVerificationRequests();
    } catch (err) {
      console.error("Error authorizing request:", err);
      setStatus("❌ Failed to authorize request.");
    }
  };

  // Reject Request 
  const handleRejectRequest = async (reqIdx) => {
    if (!isDean) return;
    const confirm = window.confirm("Are you sure you want to REJECT this verification request?");
    if (!confirm) return;

    try {
      setStatus(`Rejecting request #${reqIdx}...`);
      await contract.methods.rejectRequest(reqIdx).send({ from: account });
      setStatus("✅ Request rejected.");
      fetchVerificationRequests(); // Refresh the list
    } catch (err) {
      console.error("Error rejecting request:", err);
      setStatus("❌ Failed to reject request.");
    }
  };

  // CSV Parsing
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const ids = [];
        const wallets = [];
        const subjects = []; // 2D array for subjects
        let hasError = false;
        let errorMessage = "";

        // Iterate through rows: Expected format: [id, walletAddress, Sub1, Sub2, Sub3...]
        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i];

          // Skip empty rows or rows that only contain a blank string
          if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

          if (row.length < 3) {
            hasError = true;
            errorMessage = `Row ${i + 1} is missing data. Expected ID, Wallet, and at least one Subject ID.`;
            break;
          }

          const id = parseInt(row[0], 10);
          const wallet = row[1] ? row[1].trim() : "";
          
          // Slice from index 2 onwards to grab an infinite number of subjects
          const studentSubjects = row.slice(2).map(s => s.trim()).filter(s => s !== "");

          if (isNaN(id) || id <= 0) {
            hasError = true;
            errorMessage = `Invalid ID at row ${i + 1}.`;
            break;
          }

          // Validate Wallet Address
          if (!web3.utils.isAddress(wallet)) {
            hasError = true;
            errorMessage = `Invalid Ethereum address at row ${i + 1}: ${wallet}`;
            break;
          }

          if (studentSubjects.length === 0) {
            hasError = true;
            errorMessage = `No valid subjects found at row ${i + 1}.`;
            break;
          }

          ids.push(id);
          wallets.push(wallet);
          subjects.push(studentSubjects);
        }

        if (hasError) {
          setParsedIds([]);
          setParsedWallets([]);
          setParsedSubjects([]);
          document.getElementById("csv-upload-input").value = "";
          setBatchStatus(`❌ Upload failed: ${errorMessage}`);
          return;
        }

        if (ids.length === 0) {
          setBatchStatus("❌ No valid data found in CSV.");
          return;
        }

        setParsedIds(ids);
        setParsedWallets(wallets);
        setParsedSubjects(subjects);
        setBatchStatus(`Parsed ${ids.length} valid Student records ready for registration.`);
      },
      header: false,
      skipEmptyLines: true,
    });
  };

  // Batch register
  const handleBatchRegister = async () => {
    if (!isDean || parsedIds.length === 0) return;

    try {
      setBatchStatus("Processing transaction. Please confirm in wallet...");

      // Send the 3 arrays, including the 2D subjects array
      await contract.methods
        .registerStudents(parsedIds, parsedWallets, parsedSubjects)
        .send({ from: account });

      setBatchStatus(`✅ Successfully registered ${parsedIds.length} students with their subjects.`);

      setParsedIds([]);
      setParsedWallets([]);
      setParsedSubjects([]);
      document.getElementById("csv-upload-input").value = "";

      fetchStudentLists();
    } catch (err) {
      console.error("Batch registration failed:", err);
      setBatchStatus("❌ Batch registration failed. Ensure all subjects exist in the catalog.");
    }
  };

  // Finalize marksheet
  const handleFinalize = async () => {
    if (!isDean || !marksheet || marksheet.isUploaded) return;

    try {
      await contract.methods.finalUpload(studentId).send({ from: account });
      setStatus("✅ Marksheet finalized and uploaded.");
      const updated = await contract.methods.viewMarksheet(studentId).call({ from: account });
      setMarksheet(updated);
      fetchStudentLists();
    } catch (err) {
      console.error("Final upload failed:", err);
      setStatus("❌ Final upload failed. See console.");
    }
  };

  const fetchStudentLists = async () => {
    if (!contract || !account) return;

    try {
      const length = await contract.methods.studentListLength().call();
      const finalized = [];
      const notFinalized = [];
      const seen = new Set();

      for (let i = 0; i < length; i++) {
        const id = await contract.methods.studentList(i).call();

        if (seen.has(id)) continue;
        seen.add(id);

        try {
          const m = await contract.methods.viewMarksheet(id).call({ from: account });
          
          if (m.isUploaded) {
            finalized.push(m);
          } else if (m.isValidated && !m.isUploaded) {
            notFinalized.push(m.studentId);
          }
        } catch (innerErr) {
          console.warn(`Skipping student ${id} - Access denied or missing.`);
        }
      }

      setFinalizedStudents(finalized);
      setNotFinalizedStudents(notFinalized);
    } catch (err) {
      console.error("Error fetching student lists:", err);
    }
  };

  // CATALOG MANAGEMENT FUNCTIONS
  const handleAddCatalog = async () => {
    if (!newSubjectId) return setCatalogStatus("❌ Please enter a subject ID.");
    try {
      await contract.methods.addSubjectToCatalog(newSubjectId).send({ from: account });
      setCatalogStatus(`✅ Subject ${newSubjectId} added to catalog.`);
      setNewSubjectId("");
    } catch (err) {
      console.error(err);
      setCatalogStatus("❌ Failed to add subject.");
    }
  };

  const handleRemoveCatalog = async () => {
    if (!newSubjectId) return setCatalogStatus("❌ Please enter a subject ID.");
    try {
      await contract.methods.removeSubjectFromCatalog(newSubjectId).send({ from: account });
      setCatalogStatus(`✅ Subject ${newSubjectId} deactivated.`);
      setNewSubjectId("");
    } catch (err) {
      console.error(err);
      setCatalogStatus("❌ Failed to remove subject.");
    }
  };

  // PROFESSOR ASSIGNMENT
  const handleAssignProf = async () => {
    if (!assignProfAddress || !assignSubjectId) return setAssignStatus("❌ Fill both fields.");
    try {
      await contract.methods.assignSubjectToProfessor(assignProfAddress, assignSubjectId).send({ from: account });
      setAssignStatus(`✅ Assigned ${assignSubjectId} to Professor.`);
      setAssignProfAddress("");
      setAssignSubjectId("");
    } catch (err) {
      console.error(err);
      setAssignStatus("❌ Failed to assign subject. Is prof registered? Is subject in catalog?");
    }
  };

  const handleRevokeProf = async () => {
    if (!assignProfAddress || !assignSubjectId) return setAssignStatus("❌ Fill both fields.");
    try {
      await contract.methods.revokeSubjectFromProfessor(assignProfAddress, assignSubjectId).send({ from: account });
      setAssignStatus(`✅ Revoked ${assignSubjectId} from Professor.`);
      setAssignProfAddress("");
      setAssignSubjectId("");
    } catch (err) {
      console.error(err);
      setAssignStatus("❌ Failed to revoke subject.");
    }
  };

  // Role management
  const handleAddProfessor = async () => {
    if (!newProfAddress || newProfAddress === zeroAddress || !web3.utils.isAddress(newProfAddress)) {
      setRoleChangeStatus("❌ Invalid professor address.");
      return;
    }
    const confirm = window.confirm(`Are you sure you want to ADD Professor with address:\n${newProfAddress}?`);
    if (!confirm) return;
    try {
      await contract.methods.addProfessor(newProfAddress).send({ from: account });
      setRoleChangeStatus("✅ Professor added successfully.");
      setNewProfAddress("");
    } catch (err) {
      console.error(err);
      setRoleChangeStatus("❌ Failed to add professor.");
    }
  };

  const handleRemoveProfessor = async () => {
    if (!newProfAddress || newProfAddress === zeroAddress || !web3.utils.isAddress(newProfAddress)) {
      setRoleChangeStatus("❌ Invalid professor address.");
      return;
    }
    const confirm = window.confirm(`Are you sure you want to REMOVE Professor with address:\n${newProfAddress}?`);
    if (!confirm) return;
    try {
      await contract.methods.removeProfessor(newProfAddress).send({ from: account });
      setRoleChangeStatus("✅ Professor removed successfully.");
      setNewProfAddress("");
    } catch (err) {
      console.error(err);
      setRoleChangeStatus("❌ Failed to remove professor.");
    }
  };

  const handleAddAssociateDean = async () => {
    if (!newAssocDeanAddress || newAssocDeanAddress === zeroAddress || !web3.utils.isAddress(newAssocDeanAddress)) {
      setRoleChangeStatus("❌ Invalid associate dean address.");
      return;
    }
    const confirm = window.confirm(`Are you sure you want to ADD Associate Dean with address:\n${newAssocDeanAddress}?`);
    if (!confirm) return;
    try {
      await contract.methods.addAssociateDean(newAssocDeanAddress).send({ from: account });
      setRoleChangeStatus("✅ Associate Dean added successfully.");
      setNewAssocDeanAddress("");
    } catch (err) {
      console.error(err);
      setRoleChangeStatus("❌ Failed to add associate dean.");
    }
  };

  const handleRemoveAssociateDean = async () => {
    if (!newAssocDeanAddress || newAssocDeanAddress === zeroAddress || !web3.utils.isAddress(newAssocDeanAddress)) {
      setRoleChangeStatus("❌ Invalid associate dean address.");
      return;
    }
    const confirm = window.confirm(`Are you sure you want to REMOVE Associate Dean with address:\n${newAssocDeanAddress}?`);
    if (!confirm) return;
    try {
      await contract.methods.removeAssociateDean(newAssocDeanAddress).send({ from: account });
      setRoleChangeStatus("✅ Associate Dean removed successfully.");
      setNewAssocDeanAddress("");
    } catch (err) {
      console.error(err);
      setRoleChangeStatus("❌ Failed to remove associate dean.");
    }
  };

  return (
    <div className="form-box">
      <h3>Dean(Academics) Panel</h3>
        <div style={{ display: "inline-block", backgroundColor: "#f8f9fa", padding: "10px 20px", borderRadius: "8px", border: "1px solid #dee2e6", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
          <span style={{ fontSize: "1.1em", color: "#6c757d"}}>
            Connected Wallet: <strong style={{ color: "#007bff", wordBreak: "break-all", marginLeft: "5px", letterSpacing: "0.5px" }}>{account || "Not connected"}</strong>
          </span>
        </div>
      {/* TOP NAVIGATION MENU */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "30px", borderBottom: "2px solid #eee", paddingBottom: "15px", paddingTop: "15px" }}>
        <button 
          onClick={() => setActiveTab("register")} 
          style={{ flex: 1, backgroundColor: activeTab === "register" ? "#007bff" : "#f1f1f1", color: activeTab === "register" ? "white" : "#333", padding: "10px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
        >
           Batch Register
        </button>
        <button 
          onClick={() => setActiveTab("finalize")} 
          style={{ flex: 1, backgroundColor: activeTab === "finalize" ? "#28a745" : "#f1f1f1", color: activeTab === "finalize" ? "white" : "#333", padding: "10px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
        >
           Finalize Marksheets
        </button>
        <button 
          onClick={() => { setActiveTab("approvals"); fetchVerificationRequests(); }} 
          style={{ flex: 1, backgroundColor: activeTab === "approvals" ? "#ffc107" : "#f1f1f1", color: activeTab === "approvals" ? "#333" : "#333", padding: "10px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
        >
           Verifier Approvals
        </button>
        <button 
          onClick={() => setActiveTab("catalog")} 
          style={{ flex: 1, backgroundColor: activeTab === "catalog" ? "#17a2b8" : "#f1f1f1", color: activeTab === "catalog" ? "white" : "#333", padding: "10px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
        >
           Subjects & Load
        </button>
        <button 
          onClick={() => setActiveTab("roles")} 
          style={{ flex: 1, backgroundColor: activeTab === "roles" ? "#6c757d" : "#f1f1f1", color: activeTab === "roles" ? "white" : "#333", padding: "10px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
        >
           Manage Roles
        </button>
      </div>

      {/* TAB CONTENT: CSV Upload */}
      {activeTab === "register" && (
        <div className="upload-form" style={{ padding: "15px", backgroundColor: "#f9f9f9", borderRadius: "8px", border: "1px dashed #ccc" }}>
          <h4 style={{ marginTop: 0 }}>Batch Register Students (CSV)</h4>
          <p style={{fontSize: "0.85em", color: "#666"}}>Format: Student ID, Wallet Address, Subject1, Subject2...</p>

          <input
            id="csv-upload-input"
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            onClick={(e) => { e.target.value = null; }}
            disabled={!isDean}
            style={{ marginBottom: "15px" }}
          />

          {parsedIds.length > 0 && (
            <div style={{ marginTop: "10px", backgroundColor: "#fff", padding: "10px", borderRadius: "5px", border: "1px solid #eee" }}>
              <p>
                <strong>Preview First 5:</strong>{" "}
                {parsedIds.slice(0, 5).map((id, index) => `${id} [${parsedSubjects[index].join(", ")}]`).join(" | ")}
                {parsedIds.length > 5 ? ' ...' : ''}
              </p>
              <button onClick={handleBatchRegister} disabled={!isDean} style={{ width: "100%", marginTop: "10px" }}>
                Register {parsedIds.length} Students
              </button>
            </div>
          )}
          {!isDean && <p style={{ color: "red" }}>Only the dean can batch register students.</p>}
          <p className="status-message" style={{ fontWeight: "bold" }}>{batchStatus}</p>
        </div>
      )}

      {/* TAB CONTENT: Finalize Individual Marksheet */}
      {activeTab === "finalize" && (
        <div>
          <div className="upload-form" style={{ marginBottom: "20px" }}>
            <h4 style={{ marginTop: 0 }}>Finalize Individual Marksheet</h4>
            <input
              type="number"
              placeholder="Enter Student ID"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              style={{ marginBottom: "10px" }}
            />

            {marksheet && marksheet.studentWallet !== zeroAddress && (
              <div className="marksheet-details" style={{ textAlign: "left", padding: "15px", backgroundColor: "#f8f9fa", border: "1px solid #c8e6c9", borderRadius: "5px", marginTop: "10px" }}>
                <p style={{ margin: "0 0 10px 0", color: "#2e7d32" }}><strong>🎓 Target Record Found</strong></p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.9em" }}>
                  <p style={{ margin: 0 }}><strong>ID:</strong> {marksheet.studentId.toString()}</p>
                  <p style={{ margin: 0 }}><strong>Finalized:</strong> {marksheet.isUploaded ? "✅ Yes" : "❌ No"}</p>
                  <p style={{ margin: 0 }}><strong>Validated:</strong> {marksheet.isValidated ? "✅ Yes" : "⏳ Pending"}</p>
                </div>
                <p style={{ margin: "5px 0 0 0", fontSize: "1.50em", color: "#555", wordBreak: "break-all" }}><strong>Wallet:</strong> {marksheet.studentWallet}</p>
                
                <hr style={{ margin: "10px 0" }} />
                <p style={{ margin: "0 0 5px 0" }}><strong>Subject Results:</strong></p>
                <ul style={{ listStyleType: "none", paddingLeft: "0", margin: 0 }}>
                  {marksheet.results.map((res, idx) => (
                    <li key={idx} style={{ marginBottom: "5px", padding: "8px", backgroundColor: "#fff", borderRadius: "4px", border: "1px solid #ddd", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "1.5em"}}><strong>{res.subjectId}:</strong> {res.marks.toString() === "0" ? "Ungraded" : Number(res.marks) - 1}</span>
                      <span style={{ fontSize: "1.5em", color: "#777" }}>{res.professor === zeroAddress ? "No Prof" : "Graded"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={handleFinalize} disabled={!isDean || !marksheet || !marksheet.isValidated || marksheet.isUploaded} style={{ marginTop: "15px", width: "100%", backgroundColor: (!marksheet || !marksheet.isValidated || marksheet.isUploaded) ? "#ccc" : "#28a745" }}>
              Finalize Marksheet
            </button>
            <p className="status-message">{status}</p>
          </div>

          <div className="list-box">
            <h4 style={{ marginTop: 0 }}>Roster Overviews</h4>
            <div className="student-section">
              <button className="collapsible-button" onClick={() => { setShowNotFinalized(!showNotFinalized); if (!showNotFinalized) fetchStudentLists(); }}>
                ❌ Validated but Not Finalized {showNotFinalized ? "▲" : "▼"}
              </button>
              {showNotFinalized && (
                <table className="uploaded-students-table">
                  <thead><tr><th>Student ID</th><th>Action</th></tr></thead>
                  <tbody>
                    {notFinalizedStudents.length > 0 ? (
                      notFinalizedStudents.map((id, i) => (
                        <tr key={i}>
                          <td>{id}</td>
                          <td><button onClick={() => { setStudentId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Load Details</button></td>
                        </tr>
                      ))
                    ) : (<tr><td colSpan="2">No validated students pending finalization.</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>

            <div className="student-section">
              <button className="collapsible-button" onClick={() => { setShowFinalized(!showFinalized); if (!showFinalized) fetchStudentLists(); }}>
                ✅ Officially Finalized {showFinalized ? "▲" : "▼"}
              </button>
              {showFinalized && (
                <table className="uploaded-students-table">
                  <thead><tr><th>Student ID</th><th>Action</th></tr></thead>
                  <tbody>
                    {finalizedStudents.length > 0 ? (
                      finalizedStudents.map((s, i) => (
                        <tr key={i}>
                          <td>{s.studentId.toString()}</td>
                          <td><button onClick={() => { setStudentId(s.studentId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>View Details</button></td>
                        </tr>
                      ))
                    ) : (<tr><td colSpan="2">No finalized students available.</td></tr>)}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: VERIFIER APPROVALS */}
      {activeTab === "approvals" && (
        <div className="list-box">
          <h4 style={{ marginTop: 0 }}>Final Verification Approvals Queue</h4>
          <p style={{ fontSize: "0.9em", color: "#666" }}>These requests have passed Associate Dean audit.</p>
          
          <table className="uploaded-students-table" style={{ width: "100%", marginTop: "10px" }}>
            <thead>
              <tr>
                <th>Req #</th>
                <th>Company</th>
                <th>Student ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedRequests.length > 0 ? (
                processedRequests.map((req) => (
                  <tr key={req.index}>
                    <td>{req.index}</td>
                    <td><strong>{req.companyName}</strong></td>
                    <td>{req.studentId}</td>
                    <td>
                      <div style={{ display: "flex", gap: "5px" }}>
                        <button onClick={() => handleAuthorizeRequest(req.index)} style={{ backgroundColor: "#28a745", padding: "5px 10px", border: "none", color: "white", borderRadius: "3px" }}>Authorize</button>
                        <button onClick={() => handleRejectRequest(req.index)} style={{ backgroundColor: "#dc3545", padding: "5px 10px", border: "none", color: "white", borderRadius: "3px" }}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="4">No pending authorizations from the Associate Dean.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB CONTENT: CATALOG & LOAD */}
      {activeTab === "catalog" && (
        <div className="role-management-box">
          <h4 style={{ marginTop: 0 }}>Subject Catalog</h4>
          <div className="list-box" style={{ marginBottom: "20px" }}>
            <input type="text" placeholder="Subject ID (e.g., CS801)" value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value.toUpperCase())} style={{ marginBottom: "10px" }} />
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleAddCatalog} style={{ flex: 1, backgroundColor: "#007bff" }}>＋ Add to Catalog</button>
              <button onClick={handleRemoveCatalog} style={{ flex: 1, backgroundColor: "#dc3545" }}>－ Remove</button>
            </div>
            <p className="status-message">{catalogStatus}</p>
          </div>

          <h4>Assign Teaching Load</h4>
          <div className="list-box">
            <input type="text" placeholder="Professor Address (0x...)" value={assignProfAddress} onChange={(e) => setAssignProfAddress(e.target.value)} style={{ marginBottom: "10px" }} />
            <input type="text" placeholder="Subject ID (e.g., CS801)" value={assignSubjectId} onChange={(e) => setAssignSubjectId(e.target.value.toUpperCase())} style={{ marginBottom: "10px" }} />
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleAssignProf} style={{ flex: 1, backgroundColor: "#28a745" }}>Assign Subject</button>
              <button onClick={handleRevokeProf} style={{ flex: 1, backgroundColor: "#dc3545" }}>Revoke Subject</button>
            </div>
            <p className="status-message">{assignStatus}</p>
          </div>
        </div>
      )}

      {/* TAB CONTENT: ROLE MANAGEMENT */}
      {activeTab === "roles" && (
        <div className="role-management-box">
          <h4 style={{ marginTop: 0 }}>Manage Professors</h4>
          <div className="list-box" style={{ marginBottom: "20px" }}>
            <input type="text" placeholder="Professor Wallet Address" value={newProfAddress} onChange={(e) => setNewProfAddress(e.target.value)} style={{ marginBottom: "10px" }} />
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleAddProfessor} style={{ flex: 1, backgroundColor: "#007bff" }}>＋ Whitelist Prof</button>
              <button onClick={handleRemoveProfessor} style={{ flex: 1, backgroundColor: "#dc3545" }}>－ Revoke Prof</button>
            </div>
          </div>
          
          <h4>Manage Associate Deans (Auditors)</h4>
          <div className="list-box">
            <input type="text" placeholder="Assoc. Dean Wallet Address" value={newAssocDeanAddress} onChange={(e) => setNewAssocDeanAddress(e.target.value)} style={{ marginBottom: "10px" }} />
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleAddAssociateDean} style={{ flex: 1, backgroundColor: "#17a2b8" }}>＋ Whitelist Assoc. Dean</button>
              <button onClick={handleRemoveAssociateDean} style={{ flex: 1, backgroundColor: "#dc3545" }}>－ Revoke Assoc. Dean</button>
            </div>
          </div>
          <p className="status-message" style={{ marginTop: "15px", fontWeight: "bold" }}>{roleChangeStatus}</p>
        </div>
      )}

    </div>
  );
};

export default Dean;