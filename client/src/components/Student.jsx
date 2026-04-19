import React, { useState, useContext, useEffect } from "react";
import { Web3Context } from "../contexts/Web3Context";

const Student = () => {
  const { contract, account } = useContext(Web3Context);
  
  const [marksheet, setMarksheet] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const zeroAddress = "0x0000000000000000000000000000000000000000";

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
            continue; 
          }
        }

        if (foundRecord) {
          setMarksheet(foundRecord);

          if (foundRecord.professorAddress === zeroAddress) {
            setStatusMsg("📌 Status: Enrolled. Awaiting Professor Evaluation.");
          } else if (!foundRecord.isValidated) {
            setStatusMsg("⏳ Status: Graded. Pending Administrative Verification.");
          } else if (!foundRecord.isUploaded) {
            setStatusMsg("⏳ Status: Verified. Pending Final Dean Approval.");
          } else {
            setStatusMsg("✅ Status: Official. Your marks have been finalized.");
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

  return (
    <div className="form-box">
      <h3>Student Dashboard</h3>
      
      <div className="upload-form">
        <p>
          Connected Wallet: <span>{account || "None"}</span>
        </p>

        {/* Dynamic Status Display */}
        <div style={{ padding: "15px", backgroundColor: "#f0f8ff", borderRadius: "8px", border: "1px solid #cce0ff" }}>
          <p className="status-message" style={{ margin: 0, fontSize: "1.6em" }}>
            {isSearching ? <span className="spinner">🔄 </span> : ""} 
            {statusMsg}
          </p>
        </div>

        {/* Display details ONLY if the record is fully finalized */}
        {marksheet && marksheet.isUploaded && (
          <div className="marksheet-details">

            <p><strong>Marksheet Details:</strong></p>
            <p><strong>Student ID:</strong> {marksheet.studentId}</p>
            <p><strong>Final Marks:</strong> {marksheet.marks}</p>
            <p><strong>Evaluating Professor:</strong> {marksheet.professorAddress}</p>
            <p><strong>Verified By (Associate Dean):</strong> {marksheet.validatedBy}</p>
            <p><strong>Finalized By (Dean):</strong> {marksheet.uploadedBy}</p>
            
            {/* Convert the UNIX timestamp to a readable date */}
            <p><strong>Date Verified:</strong> {new Date(marksheet.timestamp * 1000).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Student;