import React, { useState, useContext, useEffect } from "react";
import { Web3Context } from "../contexts/Web3Context";
import Web3 from "web3";

const AssociateDean = () => {
  const { contract, account } = useContext(Web3Context);
  const [studentId, setStudentId] = useState("");
  const [marksheet, setMarksheet] = useState(null);
  const [status, setStatus] = useState("");
  const [nonce, setNonce] = useState(null);
  const [isAssociateDean, setIsAssociateDean] = useState(false);
  
  // Lists State
  const [validatedByMe, setValidatedByMe] = useState([]);
  const [pendingValidation, setPendingValidation] = useState([]);
  const [pendingVerificationRequests, setPendingVerificationRequests] = useState([]); // NEW STATE
  
  // UI Toggles
  const [showPending, setShowPending] = useState(false);
  const [showValidated, setShowValidated] = useState(false);
  const [showRequests, setShowRequests] = useState(true); // Default true for new requests

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  useEffect(() => {
    const checkRole = async () => {
      if (!contract || !account) {
        setIsAssociateDean(false);
        return;
      }
      try {
        const result = await contract.methods.isAssociateDean(account).call();
        setIsAssociateDean(result);
        if (result) {
          fetchVerificationRequests(); // Fetch requests if they are Assoc Dean
        }
      } catch (err) {
        console.error("Role check failed:", err);
        setIsAssociateDean(false);
      }
    };
    checkRole();
  }, [contract, account]);

  // Pending Verification Requests
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

  // Process verification Request
  const handleProcessRequest = async (reqIdx) => {
    try {
      setStatus(`Processing request #${reqIdx}... Please confirm transaction.`);
      await contract.methods.processRequest(reqIdx).send({ from: account });
      setStatus("✅ Request successfully processed and forwarded to Dean.");
      fetchVerificationRequests(); // Refresh list
    } catch (err) {
      console.error("Error processing request:", err);
      setStatus("❌ Failed to process request.");
    }
  };

  // Reject verification Request
  const handleRejectRequest = async (reqIdx) => {
    const confirm = window.confirm("Are you sure you want to REJECT this verification request?");
    if (!confirm) return;

    try {
      setStatus(`Rejecting request #${reqIdx}...`);
      await contract.methods.rejectRequest(reqIdx).send({ from: account });
      setStatus("✅ Request rejected.");
      fetchVerificationRequests(); // Refresh list
    } catch (err) {
      console.error("Error rejecting request:", err);
      setStatus("❌ Failed to reject request.");
    }
  };

  useEffect(() => {
    const fetchMarksheet = async () => {
      if (!studentId || !contract || !account) return;

      try {
        const result = await contract.methods.viewMarksheet(studentId).call({ from: account });

        if (result.professorAddress === zeroAddress) {
          setMarksheet(null);
          setStatus("Marksheet not found for this Student ID.");
        } else {
          setMarksheet(result);
          setStatus(
            result.isValidated
              ? "Marksheet loaded. It is already validated."
              : "Marksheet loaded. Calculate nonce to validate."
          );
        }
      } catch (err) {
        console.error("Error fetching marksheet:", err);
        setStatus("Error fetching marksheet. Check console for details.");
      }
    };

    fetchMarksheet();
  }, [studentId, contract, account]);

  useEffect(() => {
    const fetchAllStudents = async () => {
      if (!contract || !account) return;
      try {
        const length = await contract.methods.studentListLength().call();
        const validated = [];
        const pending = [];
        const seen = new Set();

        for (let i = 0; i < length; i++) {
          const sId = await contract.methods.studentList(i).call();
          if (seen.has(sId)) continue;
          seen.add(sId);

          try {
            const m = await contract.methods.viewMarksheet(sId).call({ from: account });
            if (m.professorAddress !== zeroAddress) {
              if (m.isValidated && m.validatedBy.toLowerCase() === account.toLowerCase()) {
                validated.push({
                  studentId: m.studentId,
                  marks: m.marks,
                  professorAddress: m.professorAddress,
                  timestamp: m.timestamp,
                });
              } else if (!m.isValidated) {
                pending.push({
                  studentId: m.studentId,
                  marks: m.marks,
                  professorAddress: m.professorAddress,
                });
              }
            }
          } catch (innerErr) {
            console.warn(`Skipping student ${sId} - Access denied or missing.`);
          }
        }
        setValidatedByMe(validated);
        setPendingValidation(pending);
      } catch (err) {
        console.error("Error loading student data:", err);
      }
    };
    fetchAllStudents();
  }, [contract, account]);

  const calculateNonce = async () => {
    if (!marksheet) return;
    setStatus("Calculating nonce...");
    let currentNonce = 0;
    const MAX_ITERATIONS = 10000000;

    while (currentNonce < MAX_ITERATIONS) {
      const verificationHash = Web3.utils.keccak256(
        Web3.utils.encodePacked(
          currentNonce.toString(),
          marksheet.studentId.toString(),
          marksheet.marks.toString(),
          marksheet.professorAddress
        )
      );

      if (verificationHash.startsWith("0x00")) {
        setNonce(currentNonce);
        setStatus(`Nonce found: ${currentNonce}. You can now validate.`);
        return;
      }
      currentNonce++;
    }
    setStatus("Could not find valid nonce within iterations limit.");
  };

  const handleValidate = async () => {
    if (!isAssociateDean) {
      setStatus("❌ Only an associate dean can validate marksheets.");
      return;
    }
    if (!marksheet || nonce === null) {
      setStatus("❌ No nonce found or marksheet missing.");
      return;
    }

    try {
      await contract.methods.validate(studentId, nonce).send({ from: account });
      setStatus("✅ Marksheet validated successfully!");

      const updated = await contract.methods.viewMarksheet(studentId).call({ from: account });
      setMarksheet(updated);

      setValidatedByMe((prev) => [
        ...prev,
        {
          studentId: updated.studentId,
          marks: updated.marks,
          professorAddress: updated.professorAddress,
          timestamp: updated.timestamp,
        },
      ]);
      setPendingValidation((prev) =>
        prev.filter((s) => s.studentId.toString() !== studentId.toString())
      );
    } catch (err) {
      console.error("Validation failed:", err);
      setStatus("❌ Validation failed. Check console for details.");
    }
  };

  return (
    <div className="form-box">
      <h3>Associate Dean Panel</h3>
      <div className="upload-form">
        <p>Connected as: {account || "Not connected"}</p>
        
        {/* STUDENT VALIDATION SECTION */}
        <h4 style={{marginTop: "20px"}}>1. Marksheet Validation (PoW)</h4>
        <input
          type="number"
          placeholder="Student ID"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        />

        {marksheet && marksheet.professorAddress !== zeroAddress && (
          <div className="marksheet-details">
            <p><strong>Marksheet Details (from blockchain)</strong></p>
            <p><strong>Student ID:</strong> {marksheet.studentId.toString()}</p>
            <p><strong>Marks:</strong> {marksheet.marks.toString()}</p>
            <p><strong>Professor Address:</strong> {marksheet.professorAddress}</p>
            <p><strong>Validated:</strong> {marksheet.isValidated ? "Yes" : "No"}</p>
            {marksheet.isValidated && (
              <>
                <p><strong>Validated By:</strong> {marksheet.validatedBy}</p>
                <p><strong>Validation Timestamp:</strong> {marksheet.timestamp.toString()}</p>
              </>
            )}
          </div>
        )}

        <button
          onClick={calculateNonce}
          disabled={!studentId || !marksheet || marksheet.isValidated || marksheet.professorAddress === zeroAddress || !isAssociateDean}
        >
          Calculate Nonce (PoW)
        </button>
        <button
          onClick={handleValidate}
          disabled={nonce === null || !studentId || !marksheet || marksheet.isValidated || marksheet.professorAddress === zeroAddress || !isAssociateDean}
        >
          Validate Marksheet
        </button>
        
        {!isAssociateDean && <p style={{ color: "red" }}>Only an associate dean can validate marksheets.</p>}
        <p className="status-message">{status}</p>
        
        {nonce !== null && <p>Calculated Nonce: <strong>{nonce}</strong></p>}
      </div>

      <div className="lists-container">
        
        {/* VERIFICATION REQUESTS LIST */}
        <div className="professor-list-box" /*style={{ borderColor: "#007bff", borderWidth: "2px", borderStyle: "solid" }}*/> 
          <button 
            onClick={() => {
              setShowRequests(!showRequests);
              if (!showRequests) fetchVerificationRequests();
            }}
            disabled={!isAssociateDean}
            // style={{ backgroundColor: "#007bff", color: "white" }}
          >
            📋 External Verification Requests {showRequests ? "▲" : "▼"}
          </button>

          {showRequests && (
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
                      <td /*style={{ fontWeight: "bold", color: "#333" }}*/>{req.companyName}</td>
                      <td>{req.studentId}</td>
                      <td>
                        <button 
                          onClick={() => handleProcessRequest(req.index)}
                          // style={{ backgroundColor: "#28a745", padding: "5px 10px", marginRight: "5px" }}
                        >
                          Process
                        </button>
                        <button 
                          onClick={() => handleRejectRequest(req.index)}
                          // style={{ backgroundColor: "#dc3545", padding: "5px 10px" }}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4">No pending requests from external verifiers.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Unvalidated List */}
        <div className="professor-list-box">
          <button onClick={() => setShowPending(!showPending)} disabled={!isAssociateDean}>
            ❌ Unvalidated Students {showPending ? "▲" : "▼"}
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
                {pendingValidation.length > 0 ? (
                  pendingValidation.map((s, index) => (
                    <tr key={index}>
                      <td>{s.studentId}</td>
                      <td>
                        <button onClick={() => { setStudentId(s.studentId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          Show Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="2">No validated marksheets by you yet.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Validated List */}
        <div className="professor-list-box">
          <button onClick={() => setShowValidated(!showValidated)} disabled={!isAssociateDean}>
            ✅ Validated Students {showValidated ? "▲" : "▼"}
          </button>
          {showValidated && (
            <table className="uploaded-students-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {validatedByMe.length > 0 ? (
                  validatedByMe.map((s, index) => (
                    <tr key={index}>
                      <td>{s.studentId}</td>
                      <td>
                        <button onClick={() => { setStudentId(s.studentId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          Show Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="2">No validated marksheets by you yet.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssociateDean;