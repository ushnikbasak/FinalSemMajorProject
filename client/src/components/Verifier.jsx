import React, { useState, useContext } from "react";
import { Web3Context } from "../contexts/Web3Context";

const Verifier = () => {
  const { contract } = useContext(Web3Context);
  const [studentId, setStudentId] = useState("");
  const [marks, setMarks] = useState("");
  const [professorAddress, setProfessorAddress] = useState("");
  const isValidated = true;
  const [validatedBy, setValidatedBy] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [result, setResult] = useState("");

  const handleVerify = async () => {
    if (!studentId || !marks || !professorAddress || !validatedBy || !timestamp) {
      setResult("❌ Please fill all fields");
      return;
    }

    try {
      const success = await contract.methods.verify(
        studentId,
        marks,
        professorAddress,
        isValidated,
        validatedBy,
        timestamp
      ).call();

      setResult(success ? "✅ Verified: Data matches the blockchain." : "❌ Verification failed: Data does not match.");
    } catch (err) {
      console.error(err);
      setResult("❌ Error while verifying.");
    }
  };

  return (
    <div className="form-box">
      <h3>Verifier Panel</h3>
      <div className="upload-form">
        <input
          type="number"
          placeholder="Student ID"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        />
        <br></br><br></br>
        <input
          type="number"
          placeholder="Marks"
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
        />
        <br></br><br></br>
        <input
          type="text"
          placeholder="Professor Address"
          value={professorAddress}
          onChange={(e) => setProfessorAddress(e.target.value)}
        />
        <br></br><br></br>
        <input
          type="text"
          placeholder="Validated By (Associate Dean)"
          value={validatedBy}
          onChange={(e) => setValidatedBy(e.target.value)}
        />
        <br></br><br></br>
        <input
          type="number"
          placeholder="Validation Timestamp"
          value={timestamp}
          onChange={(e) => setTimestamp(e.target.value)}
        />
        <br></br><br></br>
        <button onClick={handleVerify}>Verify Marksheet</button>
        <p>{result}</p>
      </div>
    </div>
  );
};

export default Verifier;