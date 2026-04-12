import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import HomePage from "./components/HomePage";
import Professor from "./components/Professor";
import AssociateDean from "./components/AssociateDean";
import Dean from "./components/Dean";
import Student from "./components/Student";
import Verifier from "./components/Verifier";
import "./styles.css";

// App.jsx
const App = () => {
  return (
    <Router>
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/" element={<HomePage />} /> {/* Default route to HomePage */}
          <Route path="/professor" element={<Professor />} />
          <Route path="/associate-dean" element={<AssociateDean />} />
          <Route path="/dean" element={<Dean />} />
          <Route path="/student" element={<Student />} />
          <Route path="/verifier" element={<Verifier />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;