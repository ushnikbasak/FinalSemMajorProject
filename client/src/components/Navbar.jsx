import React, { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Web3Context } from "../contexts/Web3Context";
import "../styles.css";

const Navbar = () => {
  const navigate = useNavigate();
  const { account, contract } = useContext(Web3Context);

  const handleProtectedNavigation = async (path, roleCheckFunction) => {
  if (!account || !contract) {
    alert("⚠️ Connect your wallet first.");
    return;
  }

  try {
    let isAuthorized = false;

    if (roleCheckFunction === "dean") {
      const deanAddress = await contract.methods.dean().call();
      isAuthorized = (deanAddress.toLowerCase() === account.toLowerCase());
    } else {
      isAuthorized = await contract.methods[roleCheckFunction](account).call();
    }

    if (isAuthorized) {
      navigate(path);
    } else {
      alert("⛔ You are not authorized to access this section.");
    }
  } catch (err) {
    console.error(err);
    alert("❌ Error checking authorization.");
  }
};


  return (
    <nav className="navbar">
      <h2>Decentralized Marksheet Portal</h2>
      <ul>
        <li><Link to="/">Home</Link></li>
        <li><button className="nav-role-button" onClick={() => handleProtectedNavigation("/professor", "isProfessor")}>Professor</button></li>
        <li><button className="nav-role-button" onClick={() => handleProtectedNavigation("/associate-dean", "isAssociateDean")}>Associate Dean</button></li>
        <li><button className="nav-role-button" onClick={() => handleProtectedNavigation("/dean", "dean")}>Dean</button></li>
        <li><Link to="/verifier">Verify</Link></li>
        <li><Link to="/student">Student</Link></li>

        <button
          className="connect-wallet-button"
          onClick={async () => {
            if (window.ethereum) {
              try {
                const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
                alert(`✅ Connected to MetaMask with address: ${accounts[0]}`);
              } catch (err) {
                alert("❌ Connection failed: " + err.message);
              }
            } else {
              alert("🦊 MetaMask not detected");
            }
          }}
        >
          Connect Wallet
        </button>
      </ul>
    </nav>
  );
};

export default Navbar;
