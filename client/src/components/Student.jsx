import React, { useState, useContext, useEffect } from "react";
import { Web3Context } from "../contexts/Web3Context";

const Student = () => {
  const { contract, account } = useContext(Web3Context);
  
  const [marksheet, setMarksheet] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [txHash, setTxHash] = useState(null);

  useEffect(() => {
    const findMyRecord = async () => {
      if (!contract || !account) {
        setStatusMsg("🔒 Please connect your wallet to view your records.");
        setMarksheet(null);
        return;
      }

      setIsSearching(true);
      setStatusMsg("Scanning blockchain for your official student record...");

      try {
        const length = await contract.methods.studentListLength().call();
        let foundRecord = null;

        // Loop through all registered IDs
        for (let i = 0; i < length; i++) {
          const id = await contract.methods.studentList(i).call();
          
          try {
            const m = await contract.methods.viewMarksheet(id).call({ from: account });
            
            // If the call succeeds, it means this is their record!
            if (m.studentWallet.toLowerCase() === account.toLowerCase()) {
              foundRecord = m;
              break;
            }
          } catch (e) {
            // Fails gracefully if onlyAuthorizedViewer rejects the call
            continue; 
          }
        }

        if (foundRecord) {
          setMarksheet(foundRecord);

          // Keep it simple: Only show if finalized or pending
          if (foundRecord.isUploaded) {
            // Fetch Transaction Hash
            try {
              const events = await contract.getPastEvents("MarksheetFinalized", {
                filter: { studentId: foundRecord.studentId }, // Only look for this student's event
                fromBlock: 0,
                toBlock: "latest"
              });

              if (events && events.length > 0) {
                // Grab the transaction hash from the EVM log receipt
                setTxHash(events[0].transactionHash);
              }
            } catch (eventErr) {
              console.warn("Could not fetch TxHash from logs:", eventErr);
            }

            setStatusMsg("✅ Status: Official. Your marks have been finalized.");
          } else {
            setStatusMsg("⏳ Status: Record found. Awaiting final University approval to view marks.");
          }
        } else {
          setMarksheet(null);
          setStatusMsg("❌ No registered student record found for this wallet address. Please contact the Dean.");
        }

      } catch (err) {
        console.error("Error during record search:", err);
        setStatusMsg("❌ A network error occurred while searching for your record.");
      }
      
      setIsSearching(false);
    };

    findMyRecord();
  }, [contract, account]);

  // Aggregate Calculation Helper
  const calculatePercentage = () => {
    if (!marksheet || marksheet.results.length === 0) return 0;
    let total = 0;
    marksheet.results.forEach(res => {
      total += (Number(res.marks) - 1); // Apply the -1 decoding logic
    });
    return (total / marksheet.results.length).toFixed(2);
  };

  return (
    <div className="form-box">
      <h3>Student Dashboard</h3>
      
      <div className="upload-form">
        <p>
          Connected Wallet: <span>{account || "None"}</span>
        </p>

        {/* Dynamic Status Display */}
        <div style={{ padding: "15px", backgroundColor: "#f0f8ff", borderRadius: "8px", border: "1px solid #cce0ff", marginBottom: "20px" }}>
          <p className="status-message" style={{ margin: 0, fontSize: "1.1em", fontWeight: "bold", color: "#333" }}>
            {isSearching ? <span className="spinner">🔄 </span> : ""} 
            {statusMsg}
          </p>
        </div>

        {/* Display details ONLY if the record is fully finalized */}
        {marksheet && marksheet.isUploaded && (
          <div className="marksheet-details" style={{ textAlign: "left", border: "2px solid #28a745", padding: "20px", borderRadius: "8px", backgroundColor: "#fff" }}>
            
            <h4 style={{ color: "#28a745", marginTop: 0, borderBottom: "1px solid #ddd", paddingBottom: "10px" }}>
              🎓 Official Academic Transcript
            </h4>
            
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
              <p style={{ margin: "5px 0" }}><strong>Student ID:</strong> {marksheet.studentId.toString()}</p>
              <p style={{ margin: "5px 0" }}><strong>Aggregate:</strong> <span style={{ fontSize: "1.2em", fontWeight: "bold", color: "#007bff" }}>{calculatePercentage()}%</span></p>
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
                {marksheet.results.map((res, index) => (
                  <tr key={index}>
                    <td><strong>{res.subjectId}</strong></td>
                    <td style={{ fontSize: "0.85em", color: "#555" }}>{res.professor}</td>
                    <td style={{ fontWeight: "bold", fontSize: "1.1em" }}>{Number(res.marks) - 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Blockchain Hashes and Addresses */}
            <div style={{ backgroundColor: "#f8f9fa", padding: "15px", borderRadius: "5px", fontSize: "0.9em", color: "#444" }}>
              <p style={{ margin: "0 0 5px 0", textTransform: "uppercase", fontWeight: "bold", color: "#6c757d" }}>Verified Blockchain Record</p>
              <p style={{ margin: "3px 0" }}><strong>Verified By (Assoc. Dean):</strong> {marksheet.validatedBy}</p>
              <p style={{ margin: "3px 0" }}><strong>Finalized By (Dean):</strong> {marksheet.uploadedBy}</p>
              <p style={{ margin: "3px 0" }}><strong>Date Verified:</strong> {new Date(marksheet.timestamp * 1000).toLocaleString()}</p>

              {txHash && (
                <p style={{ margin: "8px 0 0 0", paddingTop: "8px", borderTop: "1px solid #ddd" }}>
                  <strong>Digital Receipt (Transaction Hash):</strong> <br/>
                  <span style={{ fontFamily: "monospace", color: "#007bff", wordBreak: "break-all" }}>
                    {txHash}
                  </span>
                </p>
              )}

            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default Student;