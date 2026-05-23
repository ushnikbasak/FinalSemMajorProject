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
      <h3>Dean Panel</h3>
      <p>Connected as: {account || "Not connected"}</p>

      {/* CSV Upload */}
      <div className="upload-form" style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#f9f9f9", borderRadius: "8px" }}>
        <h4>Batch Register Students (CSV)</h4>
        <p style={{fontSize: "0.85em", color: "#666"}}>Format: Student ID, Wallet Address, Subject1, Subject2...</p>

        <input
          id="csv-upload-input"
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          onClick={(e) => { e.target.value = null; }}
          disabled={!isDean}
        />

        {parsedIds.length > 0 && (
          <div style={{ marginTop: "10px" }}>
            <p>
              <strong>Preview First 5:</strong>{" "}
              {parsedIds.slice(0, 5).map((id, index) => `${id} [${parsedSubjects[index].join(", ")}]`).join(" | ")}
              {parsedIds.length > 5 ? ' ...' : ''}
            </p>
            <button onClick={handleBatchRegister} disabled={!isDean}>
              Register {parsedIds.length} Students
            </button>
          </div>
        )}
        {!isDean && <p style={{ color: "red" }}>Only the dean can batch register students.</p>}
        <p className="status-message">{batchStatus}</p>
      </div>

      {/* Finalize Individual Marksheet */}
      <div className="upload-form">
        <h4>Finalize Individual Marksheet</h4>

        <input
          type="number"
          placeholder="Enter Student ID"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        />

        {marksheet && marksheet.studentWallet !== zeroAddress && (
          <div className="marksheet-details" style={{ textAlign: "left", padding: "10px", backgroundColor: "#fff", border: "1px solid #ccc", marginTop: "10px" }}>
            <p><strong>Marksheet Details (from blockchain)</strong></p>
            <p><strong>Student ID:</strong> {marksheet.studentId.toString()}</p>
            <p><strong>Wallet:</strong> {marksheet.studentWallet}</p>
            <p><strong>Validated:</strong> {marksheet.isValidated ? "Yes" : "No"}</p>
            <p><strong>Validated By:</strong> {marksheet.validatedBy}</p>
            <p><strong>Finalized:</strong> {marksheet.isUploaded ? "Yes" : "No"}</p>
            
            <hr />
            <p><strong>Subject Results:</strong></p>
            <ul style={{ listStyleType: "none", paddingLeft: "0" }}>
              {marksheet.results.map((res, idx) => (
                <li key={idx} style={{ marginBottom: "5px", padding: "5px", backgroundColor: "#f1f1f1", borderRadius: "4px" }}>
                  <strong>{res.subjectId}:</strong> {res.marks.toString() === "0" ? "Ungraded" : Number(res.marks) - 1} 
                  <br/><span style={{ fontSize: "0.85em", color: "#555" }}>Prof: {res.professor === zeroAddress ? "Pending" : res.professor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={handleFinalize} disabled={!isDean || !marksheet || !marksheet.isValidated || marksheet.isUploaded} style={{ marginTop: "10px" }}>
          Finalize Marksheet
        </button>

        <p className="status-message">{status}</p>
      </div>

      {/* Lists Section */}
      <div className="list-box">
        {/* FINAL VERIFICATION APPROVALS QUEUE  */}
        <div className="student-section">
          <button 
            className="collapsible-button"
            onClick={() => {
              setShowRequests(!showRequests);
              if (!showRequests) fetchVerificationRequests();
            }}
            disabled={!isDean}
          >
            🛡️ Final Verification Approvals {showRequests ? "▲" : "▼"}
          </button>

          {showRequests && (
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
                      <td>{req.companyName}</td>
                      <td>{req.studentId}</td>
                      <td>
                        <button onClick={() => handleAuthorizeRequest(req.index)}>Authorize</button>
                        <button onClick={() => handleRejectRequest(req.index)}>Reject</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="4">No pending authorizations.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="student-section">
          <button className="collapsible-button" onClick={() => { setShowNotFinalized(!showNotFinalized); if (!showNotFinalized) fetchStudentLists(); }}>
            ❌ Not Finalized Students {showNotFinalized ? "▲" : "▼"}
          </button>
          {showNotFinalized && (
            <table className="uploaded-students-table">
              <thead><tr><th>Student ID</th><th>Action</th></tr></thead>
              <tbody>
                {notFinalizedStudents.length > 0 ? (
                  notFinalizedStudents.map((id, i) => (
                    <tr key={i}>
                      <td>{id}</td>
                      <td>
                        <button onClick={() => { setStudentId(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Show Details</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="2">No validated students pending finalization.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="student-section">
          <button className="collapsible-button" onClick={() => { setShowFinalized(!showFinalized); if (!showFinalized) fetchStudentLists(); }}>
            ✅ Finalized Students {showFinalized ? "▲" : "▼"}
          </button>
          {showFinalized && (
            <table className="uploaded-students-table">
              <thead><tr><th>Student ID</th><th>Action</th></tr></thead>
              <tbody>
                {finalizedStudents.length > 0 ? (
                  finalizedStudents.map((s, i) => (
                    <tr key={i}>
                      <td>{s.studentId.toString()}</td>
                      <td>
                        <button onClick={() => { setStudentId(s.studentId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Show Details</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="2">No finalized students available.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <hr></hr>

      {/* Dynamic Catalog & Assignment Section */}
      <div className="role-management-box">
        <h4>Subject Catalog & Teaching Load</h4>
        <div className="list-box">
          <input type="text" placeholder="Subject ID (e.g., T801)" value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value.toUpperCase())} />
          <button onClick={handleAddCatalog}>＋ Add to Catalog</button>
          <button onClick={handleRemoveCatalog}>－ Remove from Catalog</button>
          <p className="status-message">{catalogStatus}</p>

          <hr />

          <input type="text" placeholder="Professor Address" value={assignProfAddress} onChange={(e) => setAssignProfAddress(e.target.value)} />
          <input type="text" placeholder="Subject ID (e.g., T801)" value={assignSubjectId} onChange={(e) => setAssignSubjectId(e.target.value.toUpperCase())} />
          <button onClick={handleAssignProf}>Assign Subject to Prof</button>
          <button onClick={handleRevokeProf}>Revoke Subject</button>
          <p className="status-message">{assignStatus}</p>
        </div>
      </div>
      <hr></hr>

      {/* Role Management Section */}
      <div className="role-management-box">
        <h4>Manage Roles (Whitelist)</h4>
        <div className="list-box">
            <input type="text" placeholder="Professor Address" value={newProfAddress} onChange={(e) => setNewProfAddress(e.target.value)} />
            <button onClick={handleAddProfessor}>＋ Add Professor Role</button>
            <button onClick={handleRemoveProfessor}>－ Remove Professor Role</button>
            <hr />
            <input type="text" placeholder="Associate Dean Address" value={newAssocDeanAddress} onChange={(e) => setNewAssocDeanAddress(e.target.value)} />
            <button onClick={handleAddAssociateDean}>＋ Add Associate Dean</button>
            <button onClick={handleRemoveAssociateDean}>－ Remove Associate Dean</button>
        </div>
        <p className="status-message">{roleChangeStatus}</p>
      </div>
    </div>
  );
};

export default Dean;