import React, { useState, useContext, useEffect } from "react";
import { Web3Context } from "../contexts/Web3Context";

const Verifier = () => {
  const { contract, account } = useContext(Web3Context);
  
  const [studentIdInput, setStudentIdInput] = useState("");
  const [companyNameInput, setCompanyNameInput] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [myRequests, setMyRequests] = useState([]);
  const [viewedRecord, setViewedRecord] = useState(null);

  const [txHash, setTxHash] = useState(null);

  const statusMap = {
    0: "None",
    1: "⏳ Pending (Associate Dean)",
    2: "⏳ Processed (Awaiting Dean)",
    3: "✅ Authorized",
    4: "❌ Rejected"
  };

  const fetchMyRequests = async () => {
    if (!contract || !account) return;

    try {
      const count = await contract.methods.getRequestsCount().call();
      const requests = [];

      for (let i = 0; i < count; i++) {
        const req = await contract.methods.allRequests(i).call();
        
        if (req.verifier.toLowerCase() === account.toLowerCase()) {
          requests.push({
            index: i,
            companyName: req.companyName,
            studentId: req.studentId.toString(),
            status: Number(req.status)
          });
        }
      }

      setMyRequests(requests.reverse());
    } catch (err) {
      console.error("Error fetching requests:", err);
    }
  };

  useEffect(() => {
    fetchMyRequests();
  }, [contract, account]);

  const handleRequestAccess = async () => {
    if (!studentIdInput || !companyNameInput || !contract || !account) {
      setStatusMsg("❌ Please enter both a Student ID and your Company Name.");
      return;
    }

    const alreadyRequested = myRequests.find(req => req.studentId === studentIdInput);
    if (alreadyRequested && alreadyRequested.status !== 4) {
      setStatusMsg("⚠️ You already have an active or authorized request for this ID.");
      return;
    }

    try {
      setStatusMsg("Processing request... Please confirm in your wallet.");
      
      await contract.methods.requestVerification(studentIdInput, companyNameInput).send({ from: account });
      
      setStatusMsg("✅ Request submitted! Awaiting University approval.");
      setStudentIdInput("");
      setCompanyNameInput(""); 
      
      fetchMyRequests();
    } catch (err) {
      console.error("Request failed:", err);
      setStatusMsg("❌ Request failed. Make sure the ID exists and is finalized.");
    }
  };

  const handleViewRecord = async (id) => {
    setStatusMsg("Fetching official record...");
    setViewedRecord(null); 
    setTxHash(null);

    try {
      const record = await contract.methods.viewMarksheet(id).call({ from: account });
      setViewedRecord(record);
      setStatusMsg("✅ Official record retrieved successfully.");

      // Fetch Transaction Hash
      try {
        const events = await contract.getPastEvents("MarksheetFinalized", {
          filter: { studentId: id }, // Look specifically for this student's finalization event
          fromBlock: 0,
          toBlock: "latest"
        });

        if (events && events.length > 0) {
          setTxHash(events[0].transactionHash); // Capture the native cryptographic hash
        }
      } catch (eventErr) {
        console.warn("Could not fetch TxHash from logs for verifier:", eventErr);
      }
    } catch (err) {
      console.error("Error viewing record:", err);
      setStatusMsg("❌ Access Denied. You may not be authorized yet.");
    }
  };

  // Aggregate Calculation Helper for the Verifier View
  const calculatePercentage = (record) => {
    if (!record || record.results.length === 0) return 0;
    let total = 0;
    record.results.forEach(res => {
      total += (Number(res.marks) - 1); 
    });
    return (total / record.results.length).toFixed(2);
  };

  return (
    <div className="form-box">
      <h3>Verifier Dashboard</h3>
      
      <div className="upload-form" style={{ marginBottom: "20px" }}>
        <p style={{ fontWeight: "bold", color: "#333" }}>
          Connected Wallet: <span style={{ fontWeight: "normal", color: "#555" }}>{account || "Not connected"}</span>
        </p>

        <h4>Request Official Record</h4>
        
        <input
          type="text"
          placeholder="Your Company / Institute Name"
          value={companyNameInput}
          onChange={(e) => setCompanyNameInput(e.target.value)}
          style={{ marginBottom: "10px" }}
        />
        <input
          type="number"
          placeholder="Enter Student ID"
          value={studentIdInput}
          onChange={(e) => setStudentIdInput(e.target.value)}
          style={{ marginBottom: "10px" }}
        />
        
        <button onClick={handleRequestAccess} disabled={!account}>
          Request Access
        </button>
        
        <p className="status-message">{statusMsg}</p>
      </div>

      {viewedRecord && (
        <div className="upload-form" style={{ backgroundColor: "#e8f5e9", border: "1px solid #c8e6c9", marginBottom: "20px", textAlign: "left", padding: "20px" }}>
          <h4 style={{ color: "#2e7d32", borderBottom: "2px solid #2e7d32", paddingBottom: "10px", marginTop: 0 }}>
            🎓 Official University Transcript
          </h4>
          
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
            <p style={{ margin: "5px 0" }}><strong>Student ID:</strong> {viewedRecord.studentId.toString()}</p>
            <p style={{ margin: "5px 0" }}><strong>Aggregate:</strong> <span style={{ fontSize: "1.2em", fontWeight: "bold", color: "#1b5e20" }}>{calculatePercentage(viewedRecord)}%</span></p>
          </div>

          <table className="uploaded-students-table" style={{ width: "100%", marginBottom: "20px" }}>
            <thead>
              <tr>
                <th>Subject Code</th>
                <th>Professor Address</th>
                <th>Final Marks</th>
              </tr>
            </thead>
            <tbody>
              {viewedRecord.results.map((res, index) => (
                <tr key={index}>
                  <td><strong>{res.subjectId}</strong></td>
                  <td style={{ fontSize: "0.85em", color: "#555" }}>{res.professor}</td>
                  <td style={{ fontWeight: "bold", fontSize: "1.1em", color: "#1b5e20" }}>{Number(res.marks) - 1}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Blockchain Hashes and Addresses */}
          <div style={{ backgroundColor: "#ffffff", padding: "15px", border: "1px dashed #a5d6a7", borderRadius: "5px", fontSize: "0.9em", color: "#444" }}>
            <p style={{ margin: "0 0 5px 0", textTransform: "uppercase", fontWeight: "bold", color: "#388e3c" }}>Verified Blockchain Record</p>
            <p style={{ margin: "3px 0" }}><strong>Validated By (Associate Dean):</strong> {viewedRecord.validatedBy}</p>
            <p style={{ margin: "3px 0" }}><strong>Finalized By (Dean Academics):</strong> {viewedRecord.uploadedBy}</p>
            <p style={{ margin: "3px 0" }}><strong>Verification Date:</strong> {new Date(Number(viewedRecord.timestamp) * 1000).toLocaleString()}</p>

            {txHash && (
            <p style={{ margin: "8px 0 0 0", paddingTop: "8px", borderTop: "1px dashed #a5d6a7" }}>
              <strong>On-Chain Receipt (TxHash):</strong> <br/>
              <span style={{ fontFamily: "monospace", color: "#2e7d32", wordBreak: "break-all", fontSize: "0.95em", fontWeight: "bold" }}>
                {txHash}
              </span>
            </p>
        )}
          </div>
          
          <button onClick={() => setViewedRecord(null)} style={{ marginTop: "15px", backgroundColor: "#666", width: "100%" }}>
            Close Record
          </button>
        </div>
      )}

      <hr />

      <div className="list-box">
        <h4>My Verification Requests</h4>
        
        {myRequests.length > 0 ? (
          <table className="uploaded-students-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Requested For</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((req, index) => (
                <tr key={index}>
                  <td>{req.studentId}</td>
                  <td>{req.companyName}</td>
                  <td style={{ fontWeight: "bold" }}>
                    {statusMap[req.status]}
                  </td>
                  <td>
                    <button 
                      onClick={() => handleViewRecord(req.studentId)}
                      disabled={req.status !== 3}
                      style={{
                        backgroundColor: req.status === 3 ? "#007bff" : "#ccc",
                        cursor: req.status === 3 ? "pointer" : "not-allowed",
                        padding: "5px 10px",
                        border: "none",
                        color: "white",
                        borderRadius: "3px"
                      }}
                    >
                      {req.status === 3 ? "View Record" : "Locked"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>You have not made any verification requests yet.</p>
        )}
      </div>

    </div>
  );
};

export default Verifier;