import React, { useState, useContext, useEffect } from "react";
import Papa from "papaparse";
import { Web3Context } from "../contexts/Web3Context";

const Dean = () => {
  const { contract, account, web3 } = useContext(Web3Context);

  const [studentId, setStudentId] = useState("");
  const [marksheet, setMarksheet] = useState(null);
  const [status, setStatus] = useState("");
  const [isDean, setIsDean] = useState(false);

  const [parsedIds, setParsedIds] = useState([]);
  const [batchStatus, setBatchStatus] = useState("");

  const [newProfAddress, setNewProfAddress] = useState("");
  const [newAssocDeanAddress, setNewAssocDeanAddress] = useState("");
  const [roleChangeStatus, setRoleChangeStatus] = useState("");

  const [finalizedStudents, setFinalizedStudents] = useState([]);
  const [notFinalizedStudents, setNotFinalizedStudents] = useState([]);

  const [showFinalized, setShowFinalized] = useState(false);
  const [showNotFinalized, setShowNotFinalized] = useState(false);

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  // Check dean role
  useEffect(() => {
    const checkRole = async () => {
      if (!contract || !account) return setIsDean(false);
      try {
        const deanAddress = await contract.methods.dean().call();
        setIsDean(deanAddress.toLowerCase() === account.toLowerCase());
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
      if (!studentId || !contract) return;

      try {
        const result = await contract.methods.viewMarksheet(studentId).call();

        if (result.professorAddress === zeroAddress) {
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
        setStatus("Error fetching marksheet. Check console for details.");
      }
    };

    fetchMarksheet();
  }, [studentId, contract]);

  // CSV parsing (To catch 0 and negative numbers)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const raw = results.data.flat();
        
        // 1. Convert everything to integers first
        const parsedArray = raw.map((id) => parseInt(id, 10));

        // 2. Check for invalid IDs (0 or negative) BEFORE filtering
        const hasInvalidId = parsedArray.some((id) => !isNaN(id) && id <= 0);

        if (hasInvalidId) {
          setParsedIds([]);
          document.getElementById("csv-upload-input").value = "";
          setBatchStatus("❌ Upload failed: An invalid student id (0 or negative) exists in the csv.");
          return; // Stop execution
        }

        // 3. Filter out non-numbers (like empty strings or text)
        const validIds = parsedArray.filter((id) => !isNaN(id));

        if (validIds.length === 0) {
          setBatchStatus("❌ No valid student IDs found in CSV.");
          return;
        }

        setParsedIds(validIds);
        setBatchStatus(
          `Parsed ${validIds.length} valid Student IDs ready for registration.`
        );
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

      await contract.methods
        .registerStudents(parsedIds)
        .send({ from: account });

      setBatchStatus(
        `✅ Successfully registered ${parsedIds.length} students.`
      );

      setParsedIds([]);
      document.getElementById("csv-upload-input").value = "";

      fetchStudentLists();
    } catch (err) {
      console.error("Batch registration failed:", err);
      setBatchStatus("❌ Batch registration failed. Check console.");
    }
  };

  // Finalize marksheet
  const handleFinalize = async () => {
    if (!isDean || !marksheet || marksheet.isUploaded) return;

    try {
      await contract.methods.finalUpload(studentId).send({ from: account });

      setStatus("✅ Marksheet finalized and uploaded.");

      const updated = await contract.methods.viewMarksheet(studentId).call();
      setMarksheet(updated);

      fetchStudentLists();
    } catch (err) {
      console.error("Final upload failed:", err);
      setStatus("❌ Final upload failed. See console.");
    }
  };

  // Fetch lists
  const fetchStudentLists = async () => {
    if (!contract) return;

    try {
      const length = await contract.methods.studentListLength().call();

      const finalized = [];
      const notFinalized = [];
      const seen = new Set();

      for (let i = 0; i < length; i++) {
        const id = await contract.methods.studentList(i).call();

        if (seen.has(id)) continue;
        seen.add(id);

        const m = await contract.methods.viewMarksheet(id).call();

        if (m.professorAddress === zeroAddress) continue;

        if (m.isUploaded) {
          finalized.push({
            studentId: m.studentId,
            marks: m.marks,
            professorAddress: m.professorAddress,
            validatedBy: m.validatedBy,
            timestamp: m.timestamp,
          });
        } else if (m.isValidated && !m.isUploaded) {
          notFinalized.push(m.studentId);
        }
      }

      setFinalizedStudents(finalized);
      setNotFinalizedStudents(notFinalized);
    } catch (err) {
      console.error("Error fetching student lists:", err);
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

        <input
          id="csv-upload-input"
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          onClick={(e) => {
            e.target.value = null; // Forces onChange to fire even for the same file
          }}
          disabled={!isDean}
        />

        {parsedIds.length > 0 && (
          <div style={{ marginTop: "10px" }}>
            <p>
              <strong>Preview First 5 IDs:</strong>{" "}
              {parsedIds.slice(0, 5).join(", ")}
              {parsedIds.length > 5 ? ' ...' : ''}
            </p>

            <button onClick={handleBatchRegister} disabled={!isDean}>
              Register {parsedIds.length} Students
            </button>
          </div>
        )}

        {!isDean && (
          <p style={{ color: "red" }}>
            Only the dean can batch register students.
          </p>
        )}

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

        {marksheet && marksheet.professorAddress !== zeroAddress && (
          <div className="marksheet-details">
            <p><strong>Marksheet Details (from blockchain)</strong></p>
            <p><strong>Student ID:</strong> {marksheet.studentId}</p>
            <p><strong>Marks:</strong> {marksheet.marks}</p>
            <p><strong>Professor Address:</strong> {marksheet.professorAddress}</p>
            <p><strong>Validated:</strong> {marksheet.isValidated ? "Yes" : "No"}</p>
            <p><strong>Validated By:</strong> {marksheet.validatedBy}</p>
            <p><strong>Validation Timestamp:</strong> {marksheet.timestamp}</p>
            <p><strong>Finalized:</strong> {marksheet.isUploaded ? "Yes" : "No"}</p>
          </div>
        )}

        <button
          onClick={handleFinalize}
          disabled={!isDean || !marksheet || !marksheet.isValidated || marksheet.isUploaded}
        >
          Finalize Marksheet
        </button>

        <p className="status-message">{status}</p>
      </div>

      {/* Lists Section */}
      <div className="list-box">
        <div className="student-section">
          <button
            className="collapsible-button"
            onClick={() => {
              setShowNotFinalized(!showNotFinalized);
              if (!showNotFinalized) fetchStudentLists();
            }}
          >
            ❌ Not Finalized Students {showNotFinalized ? "▲" : "▼"}
          </button>

          {showNotFinalized && (
            <table className="uploaded-students-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {notFinalizedStudents.length > 0 ? (
                  notFinalizedStudents.map((id, i) => (
                    <tr key={i}>
                      <td>{id}</td>
                      <td>
                        <button 
                        onClick={() => {
                          setStudentId(id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}>
                          Show Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="2">No validated students pending finalization.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="student-section">
          <button
            className="collapsible-button"
            onClick={() => {
              setShowFinalized(!showFinalized);
              if (!showFinalized) fetchStudentLists();
            }}
          >
            ✅ Finalized Students {showFinalized ? "▲" : "▼"}
          </button>

          {showFinalized && (
            <table className="uploaded-students-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {finalizedStudents.length > 0 ? (
                  finalizedStudents.map((s, i) => (
                    <tr key={i}>
                      <td>{s.studentId}</td>
                      <td>
                        <button 
                        onClick={() => {
                          setStudentId(s.studentId);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}>
                          Show Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="2">No finalized students available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <hr></hr>

      {/* Role Management Section */}
      <div className="role-management-box">
        <h4>Manage Roles</h4>

        <div className="list-box">
            <input
              type="text"
              placeholder="Professor Address"
              value={newProfAddress}
              onChange={(e) => setNewProfAddress(e.target.value)}
            />
            
            <button onClick={handleAddProfessor}>＋ Add Professor</button>
            <button onClick={handleRemoveProfessor}>－ Remove Professor</button>
          
            <hr></hr>

            <input
              type="text"
              placeholder="Associate Dean Address"
              value={newAssocDeanAddress}
              onChange={(e) => setNewAssocDeanAddress(e.target.value)}
            />

            <button onClick={handleAddAssociateDean}>＋ Add Associate Dean</button>
            <button onClick={handleRemoveAssociateDean}>－ Remove Associate Dean</button>
        </div>

        <p className="status-message">{roleChangeStatus}</p>
      </div>
    </div>
  );
};

export default Dean;