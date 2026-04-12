import React, { createContext, useEffect, useState } from "react";
import Web3 from "web3";
import MainContractABI from "../contracts/MainContract.json";
import { CONTRACT_ADDRESS } from "../contracts/contractAddress";

export const Web3Context = createContext();

export const Web3Provider = ({ children }) => {
  const [web3, setWeb3] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (window.ethereum) {
        try {
          // Initialization of Web3
          const web3Instance = new Web3(window.ethereum);
          setWeb3(web3Instance);

          // Request accounts
          const accounts = await window.ethereum.request({ 
            method: "eth_requestAccounts" 
          });
          setAccount(accounts[0]);

          // Initialization of contract
          const contractInstance = new web3Instance.eth.Contract(
            MainContractABI.abi,
            CONTRACT_ADDRESS
          );
          setContract(contractInstance);

          // Handle account changes
          window.ethereum.on("accountsChanged", (newAccounts) => {
            setAccount(newAccounts[0] || null);
          });

        } catch (error) {
          console.error("Error initializing Web3:", error.message);
          alert("Error connecting to MetaMask");
        }
      } else {
        alert("Please install MetaMask to use this DApp");
      }
    };
    init();
  }, []);

  return (
    <Web3Context.Provider value={{ web3, contract, account }}>
      {children}
    </Web3Context.Provider>
  );
};