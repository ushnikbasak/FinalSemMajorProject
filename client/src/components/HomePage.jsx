import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Web3Context } from "../contexts/Web3Context";

const HomePage = () => {
  const { account, contract } = useContext(Web3Context);
  const navigate = useNavigate();

  const checkAndNavigate = async (path, roleCheck) => {
    if (!account || !contract) {
      alert("⚠️ Connect your wallet first.");
      return;
    }

    try {
      let isAuthorized = false;

      if (roleCheck === "dean") {
        const deanAddress = await contract.methods.dean().call();
        isAuthorized = (deanAddress.toLowerCase() === account.toLowerCase());
      } else {
        isAuthorized = await contract.methods[roleCheck](account).call();
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
    <div className="home-container">
      <h3>Welcome to XYZ University DApp</h3>
      <p>Please connect your MetaMask Wallet before proceeding:</p>
      <div className="role-options">
        <div className="role-card" onClick={() => checkAndNavigate("/professor", "isProfessor")}>
          {/* <div className="emoji">👨‍🏫</div> */}
          <h4>Professor</h4>
        </div>

        <div className="role-card" onClick={() => checkAndNavigate("/associate-dean", "isAssociateDean")}>
          {/* <div className="emoji">🧑‍💼</div> */}
          <h4>Associate Dean</h4>
        </div>

        <div className="role-card" onClick={() => checkAndNavigate("/dean", "dean")}>
          {/* <div className="emoji">🎓</div> */}
          <h4>Dean</h4>
        </div>

        <div className="role-card" onClick={() => navigate("/verifier")}>
          {/* <div className="emoji">🧾</div> */}
          <h4>Verify Marksheet</h4>
        </div>

        <div className="role-card" onClick={() => navigate("/student")}>
          {/* <div className="emoji">👩‍🎓</div> */}
          <h4>Student</h4>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
