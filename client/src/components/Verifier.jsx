import React, { useState, useContext, useEffect } from "react";
import { Web3Context } from "../contexts/Web3Context";

const Verifier = () => {
  const { contract, account } = useContext(Web3Context);
  
  const [studentIdInput, setStudentIdInput] = useState("");
  const [companyNameInput, setCompanyNameInput] = useState(""); // New State
  const [statusMsg, setStatusMsg] = useState("");
  const [myRequests, setMyRequests] = useState([]);
  const [viewedRecord, setViewedRecord] = useState(null);

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
            companyName: req.companyName, // Fetching the new field
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
      setCompanyNameInput(""); // Clear the input
      
      fetchMyRequests();
    } catch (err) {
      console.error("Request failed:", err);
      setStatusMsg("❌ Request failed. Make sure the ID exists and is finalized.");
    }
  };

  const handleViewRecord = async (id) => {
    setStatusMsg("Fetching official record...");
    setViewedRecord(null); 

    try {
      const record = await contract.methods.viewMarksheet(id).call({ from: account });
      setViewedRecord(record);
      setStatusMsg("✅ Official record retrieved successfully.");
    } catch (err) {
      console.error("Error viewing record:", err);
      setStatusMsg("❌ Access Denied. You may not be authorized yet.");
    }
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
        <div className="upload-form" /*style={{ backgroundColor: "#e8f5e9", border: "1px solid #c8e6c9", marginBottom: "20px" }}*/>
          <h4 /*style={{ color: "#2e7d32", borderBottom: "2px solid #2e7d32", paddingBottom: "5px" }}*/>
            🎓 Official University Transcript
          </h4>
          <p><strong>Student ID:</strong> {viewedRecord.studentId.toString()}</p>
          <p /*style={{ fontSize: "1.2em", color: "#1b5e20" }}*/>
            <strong>Final Marks:</strong> {viewedRecord.marks.toString()}
          </p>
          <p><strong>Evaluating Professor:</strong> {viewedRecord.professorAddress}</p>
          <p><strong>Associate Dean Verifier:</strong> {viewedRecord.validatedBy}</p>
          <p><strong>Finalizing Dean:</strong> {viewedRecord.uploadedBy}</p>
          <p><strong>Verification Date:</strong> {new Date(Number(viewedRecord.timestamp) * 1000).toLocaleString()}</p>
          
          <button onClick={() => setViewedRecord(null)} style={{ marginTop: "10px", backgroundColor: "#666" }}>
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
                      // style={{
                      //   backgroundColor: req.status === 3 ? "#007bff" : "#ccc",
                      //   cursor: req.status === 3 ? "pointer" : "not-allowed"
                      // }}
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